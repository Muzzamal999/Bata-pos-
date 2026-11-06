import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Stock Inward (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();
  const branchX = randomUUID();

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
  let variant2: { id: string };

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
      data: { tenantId: tenantA, articleNumber: 'INW-ART-1', name: 'Inward Shoe' },
    });
    variant1 = await prisma.productVariant.create({
      data: {
        tenantId: tenantA,
        productId: product.id,
        size: '40',
        color: 'Black',
        sku: 'INW-SKU-1',
      },
    });
    variant2 = await prisma.productVariant.create({
      data: {
        tenantId: tenantA,
        productId: product.id,
        size: '41',
        color: 'Black',
        sku: 'INW-SKU-2',
      },
    });
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.stockBalance.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.stockInwardLine.deleteMany();
    await prisma.stockInwardReceipt.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('rejects an unprivileged caller', async () => {
    await as(noPermsToken, 'post', '/api/v1/stock-inward').send({ branchId: branchX }).expect(403);
  });

  it('creates a receipt with a generated, unique reference number', async () => {
    const res = await as(adminAToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchX, supplierReference: 'PO-1' })
      .expect(201);
    expect(res.body.referenceNumber).toMatch(/^GRN-\d{8}-[A-F0-9]{6}$/);
    expect(res.body.status).toBe('DRAFT');
  });

  it('adds lines and rejects a variant from another context', async () => {
    const receipt = await as(adminAToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchX })
      .expect(201)
      .then((r) => r.body);

    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/lines`)
      .send({ variantId: variant1.id, expectedQty: 20 })
      .expect(201);

    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/lines`)
      .send({ variantId: randomUUID(), expectedQty: 5 })
      .expect(400);
  });

  it('fully confirms a receipt, updating inventory and marking it CONFIRMED', async () => {
    const receipt = await as(adminAToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchX })
      .expect(201)
      .then((r) => r.body);
    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/lines`)
      .send({ variantId: variant1.id, expectedQty: 20 })
      .expect(201);
    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/lines`)
      .send({ variantId: variant2.id, expectedQty: 15 })
      .expect(201);

    const confirmed = await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/confirm`)
      .send({})
      .expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(
      confirmed.body.lines.find((l: { variantId: string }) => l.variantId === variant1.id)
        .receivedQty,
    ).toBe(20);

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchX}`,
    ).expect(200);
    const v1Balance = balances.body.data.find(
      (b: { variantId: string }) => b.variantId === variant1.id,
    );
    const v2Balance = balances.body.data.find(
      (b: { variantId: string }) => b.variantId === variant2.id,
    );
    expect(v1Balance.onHandQty).toBe(20);
    expect(v2Balance.onHandQty).toBe(15);
  });

  it('supports a partial receipt where received quantity is less than expected', async () => {
    const receipt = await as(adminAToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchX })
      .expect(201)
      .then((r) => r.body);
    const line = await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/lines`)
      .send({ variantId: variant1.id, expectedQty: 20 })
      .expect(201)
      .then((r) => r.body);

    const confirmed = await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/confirm`)
      .send({ lines: [{ lineId: line.id, receivedQty: 12 }] })
      .expect(201);
    expect(confirmed.body.lines[0].receivedQty).toBe(12);
    expect(confirmed.body.lines[0].expectedQty).toBe(20);

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchX}`,
    ).expect(200);
    expect(balances.body.data[0].onHandQty).toBe(12);
  });

  it('rejects confirming an already-confirmed receipt', async () => {
    const receipt = await as(adminAToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchX })
      .expect(201)
      .then((r) => r.body);
    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/lines`)
      .send({ variantId: variant1.id, expectedQty: 5 })
      .expect(201);
    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/confirm`)
      .send({})
      .expect(201);

    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/confirm`)
      .send({})
      .expect(400);
  });

  it('rejects confirming a receipt with no lines', async () => {
    const receipt = await as(adminAToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchX })
      .expect(201)
      .then((r) => r.body);
    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/confirm`)
      .send({})
      .expect(400);
  });

  it('rejects modifying a line once the receipt is confirmed', async () => {
    const receipt = await as(adminAToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchX })
      .expect(201)
      .then((r) => r.body);
    const line = await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/lines`)
      .send({ variantId: variant1.id, expectedQty: 5 })
      .expect(201)
      .then((r) => r.body);
    await as(adminAToken, 'post', `/api/v1/stock-inward/${receipt.id}/confirm`)
      .send({})
      .expect(201);

    await as(adminAToken, 'patch', `/api/v1/stock-inward/${receipt.id}/lines/${line.id}`)
      .send({ expectedQty: 99 })
      .expect(400);
  });
});
