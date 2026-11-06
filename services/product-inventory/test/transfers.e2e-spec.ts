import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Inter-Branch Transfers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();
  const branchSource = randomUUID();
  const branchDest = randomUUID();

  function tokenFor(tenantId: string | null, permissions: string[]) {
    return jwt.sign(
      { sub: randomUUID(), tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const adminAToken = tokenFor(tenantA, ALL_PERMISSION_CODES);
  const noPermsToken = tokenFor(tenantA, []);

  let variant1: { id: string };

  async function stockInSource(qty: number) {
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variant1.id,
        branchId: branchSource,
        quantity: qty,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
  }

  async function createTransfer(requestedQty: number) {
    return as(adminAToken, 'post', '/api/v1/transfers')
      .send({
        sourceBranchId: branchSource,
        destinationBranchId: branchDest,
        lines: [{ variantId: variant1.id, requestedQty }],
      })
      .expect(201)
      .then((r) => r.body);
  }

  async function createRequestedApprovedTransfer(qty: number) {
    const transfer = await createTransfer(qty);
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/request`).send({}).expect(201);
    return as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/approve`)
      .send({})
      .expect(201)
      .then((r) => r.body);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const product = await prisma.product.create({
      data: { tenantId: tenantA, articleNumber: 'IBT-ART-1', name: 'Transfer Shoe' },
    });
    variant1 = await prisma.productVariant.create({
      data: {
        tenantId: tenantA,
        productId: product.id,
        size: '39',
        color: 'White',
        sku: 'IBT-SKU-1',
      },
    });
  });

  afterEach(async () => {
    await prisma.inventoryReservation.deleteMany();
    await prisma.stockTransferLine.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.stockBalance.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
  });

  function as(token: string, method: 'get' | 'post', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('rejects an unprivileged caller', async () => {
    await as(noPermsToken, 'post', '/api/v1/transfers')
      .send({
        sourceBranchId: branchSource,
        destinationBranchId: branchDest,
        lines: [{ variantId: variant1.id, requestedQty: 1 }],
      })
      .expect(403);
  });

  it('rejects a transfer with the same source and destination branch', async () => {
    await as(adminAToken, 'post', '/api/v1/transfers')
      .send({
        sourceBranchId: branchSource,
        destinationBranchId: branchSource,
        lines: [{ variantId: variant1.id, requestedQty: 1 }],
      })
      .expect(400);
  });

  it('walks the full lifecycle: draft -> requested -> approved -> dispatched -> in_transit -> received', async () => {
    await stockInSource(50);
    const transfer = await createTransfer(20);
    expect(transfer.status).toBe('DRAFT');

    const requested = await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/request`)
      .send({})
      .expect(201);
    expect(requested.body.status).toBe('REQUESTED');

    const approved = await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/approve`)
      .send({})
      .expect(201);
    expect(approved.body.status).toBe('APPROVED');

    const sourceBalanceAfterApprove = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchSource}`,
    ).expect(200);
    expect(sourceBalanceAfterApprove.body.data[0].reservedQty).toBe(20);
    expect(sourceBalanceAfterApprove.body.data[0].availableQty).toBe(30);

    const dispatched = await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/dispatch`)
      .send({})
      .expect(201);
    expect(dispatched.body.status).toBe('DISPATCHED');

    const sourceBalanceAfterDispatch = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchSource}`,
    ).expect(200);
    expect(sourceBalanceAfterDispatch.body.data[0].onHandQty).toBe(30);
    expect(sourceBalanceAfterDispatch.body.data[0].reservedQty).toBe(0);

    const inTransit = await as(
      adminAToken,
      'post',
      `/api/v1/transfers/${transfer.id}/mark-in-transit`,
    )
      .send({})
      .expect(201);
    expect(inTransit.body.status).toBe('IN_TRANSIT');

    const received = await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/receive`)
      .send({})
      .expect(201);
    expect(received.body.status).toBe('RECEIVED');
    expect(received.body.lines[0].receivedQty).toBe(20);

    const destBalance = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchDest}`,
    ).expect(200);
    expect(destBalance.body.data[0].onHandQty).toBe(20);
  });

  it('rejects approval when there is insufficient available stock, and reserves nothing', async () => {
    await stockInSource(5);
    const transfer = await createTransfer(10);
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/request`).send({}).expect(201);

    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/approve`).send({}).expect(400);

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchSource}`,
    ).expect(200);
    expect(balances.body.data[0].reservedQty).toBe(0);
  });

  it('rejects requesting/approving/dispatching out of order', async () => {
    await stockInSource(50);
    const transfer = await createTransfer(10);

    // Can't approve a DRAFT transfer directly.
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/approve`).send({}).expect(400);
    // Can't dispatch a DRAFT transfer.
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/dispatch`).send({}).expect(400);
  });

  it('rejects a transfer and leaves source stock untouched', async () => {
    await stockInSource(20);
    const transfer = await createTransfer(10);
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/request`).send({}).expect(201);

    const rejected = await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/reject`)
      .send({ reason: 'Not needed' })
      .expect(201);
    expect(rejected.body.status).toBe('REJECTED');

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchSource}`,
    ).expect(200);
    expect(balances.body.data[0].onHandQty).toBe(20);
    expect(balances.body.data[0].reservedQty).toBe(0);
  });

  it('cancels an approved transfer and releases its reservation', async () => {
    await stockInSource(20);
    const approved = await createRequestedApprovedTransfer(10);

    let balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchSource}`,
    ).expect(200);
    expect(balances.body.data[0].reservedQty).toBe(10);

    const cancelled = await as(adminAToken, 'post', `/api/v1/transfers/${approved.id}/cancel`)
      .send({ reason: 'Changed plans' })
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');

    balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchSource}`,
    ).expect(200);
    expect(balances.body.data[0].reservedQty).toBe(0);
    expect(balances.body.data[0].onHandQty).toBe(20);
  });

  it('rejects cancelling a dispatched transfer', async () => {
    await stockInSource(20);
    const approved = await createRequestedApprovedTransfer(10);
    await as(adminAToken, 'post', `/api/v1/transfers/${approved.id}/dispatch`).send({}).expect(201);

    await as(adminAToken, 'post', `/api/v1/transfers/${approved.id}/cancel`).send({}).expect(400);
  });

  it('supports a partial receipt with a quantity discrepancy', async () => {
    await stockInSource(30);
    const approved = await createRequestedApprovedTransfer(20);
    await as(adminAToken, 'post', `/api/v1/transfers/${approved.id}/dispatch`).send({}).expect(201);
    await as(adminAToken, 'post', `/api/v1/transfers/${approved.id}/mark-in-transit`)
      .send({})
      .expect(201);

    const line = approved.lines[0];
    const received = await as(adminAToken, 'post', `/api/v1/transfers/${approved.id}/receive`)
      .send({ lines: [{ lineId: line.id, quantity: 17 }] })
      .expect(201);
    expect(received.body.lines[0].dispatchedQty).toBe(20);
    expect(received.body.lines[0].receivedQty).toBe(17);

    const destBalance = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchDest}`,
    ).expect(200);
    expect(destBalance.body.data[0].onHandQty).toBe(17);
  });

  it('returns 404 for a transfer from another tenant', async () => {
    const otherTenant = randomUUID();
    const product = await prisma.product.create({
      data: { tenantId: otherTenant, articleNumber: 'B-IBT-1', name: 'Other Tenant Shoe' },
    });
    const otherVariant = await prisma.productVariant.create({
      data: {
        tenantId: otherTenant,
        productId: product.id,
        size: '1',
        color: 'X',
        sku: 'B-IBT-SKU-1',
      },
    });
    const otherTransfer = await prisma.stockTransfer.create({
      data: {
        tenantId: otherTenant,
        referenceNumber: 'IBT-OTHER-1',
        sourceBranchId: randomUUID(),
        destinationBranchId: randomUUID(),
        lines: { create: [{ variantId: otherVariant.id, requestedQty: 1 }] },
      },
    });

    await as(adminAToken, 'get', `/api/v1/transfers/${otherTransfer.id}`).expect(404);

    await prisma.stockTransferLine.deleteMany({ where: { transferId: otherTransfer.id } });
    await prisma.stockTransfer.deleteMany({ where: { id: otherTransfer.id } });
    await prisma.productVariant.deleteMany({ where: { id: otherVariant.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
  });

  it('ensures stock cannot be dispatched twice, even under concurrent dispatch requests', async () => {
    await stockInSource(20);
    const approved = await createRequestedApprovedTransfer(20);

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        as(adminAToken, 'post', `/api/v1/transfers/${approved.id}/dispatch`).send({}),
      ),
    );

    const succeeded = attempts.filter((r) => r.status === 201);
    const rejected = attempts.filter((r) => r.status === 400);
    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(4);

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchSource}`,
    ).expect(200);
    // Exactly one dispatch's worth of stock (20) was removed - never more.
    expect(balances.body.data[0].onHandQty).toBe(0);
    expect(balances.body.data[0].reservedQty).toBe(0);

    const finalTransfer = await as(adminAToken, 'get', `/api/v1/transfers/${approved.id}`).expect(
      200,
    );
    expect(finalTransfer.body.status).toBe('DISPATCHED');
  });
});
