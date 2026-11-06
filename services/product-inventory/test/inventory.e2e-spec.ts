import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
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

  let variantA: { id: string; tenantId: string };

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
      data: { tenantId: tenantA, articleNumber: 'INV-ART-1', name: 'Inventory Shoe' },
    });
    variantA = await prisma.productVariant.create({
      data: {
        tenantId: tenantA,
        productId: product.id,
        size: '42',
        color: 'Black',
        sku: 'INV-SKU-1',
      },
    });
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.stockBalance.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('rejects an unprivileged caller', async () => {
    await as(noPermsToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(403);
  });

  it('stocks in and reflects the new balance', async () => {
    const res = await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    expect(res.body.balanceAfter).toBe(10);
    expect(res.body.type).toBe('STOCK_IN');

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchX}`,
    ).expect(200);
    expect(balances.body.data[0].onHandQty).toBe(10);
    expect(balances.body.data[0].availableQty).toBe(10);
  });

  it('prevents stock-out from making the balance negative', async () => {
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 5,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    await as(adminAToken, 'post', '/api/v1/inventory/stock-out')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(400);

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchX}`,
    ).expect(200);
    expect(balances.body.data[0].onHandQty).toBe(5);
  });

  it('replays the same idempotency key without double-applying the movement', async () => {
    const key = randomUUID();
    const first = await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({ variantId: variantA.id, branchId: branchX, quantity: 7, idempotencyKey: key })
      .expect(201);
    const second = await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({ variantId: variantA.id, branchId: branchX, quantity: 7, idempotencyKey: key })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchX}`,
    ).expect(200);
    expect(balances.body.data[0].onHandQty).toBe(7);
  });

  it('applies a signed adjustment and records it as its own movement type', async () => {
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 20,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const res = await as(adminAToken, 'post', '/api/v1/inventory/adjustments')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantityDelta: -3,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    expect(res.body.type).toBe('ADJUSTMENT');
    expect(res.body.balanceAfter).toBe(17);
  });

  it('marks stock as damaged, decrementing on-hand and recording DAMAGE type', async () => {
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const res = await as(adminAToken, 'post', '/api/v1/inventory/damage')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 2,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    expect(res.body.type).toBe('DAMAGE');
    expect(res.body.balanceAfter).toBe(8);
  });

  it('returns 404 for a variant from another tenant', async () => {
    const productB = await prisma.product.create({
      data: { tenantId: tenantB, articleNumber: 'B-INV-1', name: 'Other Tenant Shoe' },
    });
    const variantB = await prisma.productVariant.create({
      data: { tenantId: tenantB, productId: productB.id, size: '1', color: 'X', sku: 'B-SKU-1' },
    });

    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantB.id,
        branchId: branchX,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(404);
  });

  it('exposes the full immutable ledger for a variant/branch', async () => {
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    await as(adminAToken, 'post', '/api/v1/inventory/stock-out')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 4,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const ledger = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/ledger?branchId=${branchX}`,
    ).expect(200);
    expect(ledger.body.data).toHaveLength(2);
    expect(ledger.body.data.map((m: { type: string }) => m.type).sort()).toEqual([
      'STOCK_IN',
      'STOCK_OUT',
    ]);
  });

  it('sets a low-stock threshold and filters balances by it', async () => {
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 5,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    await as(adminAToken, 'patch', '/api/v1/inventory/thresholds')
      .send({ variantId: variantA.id, branchId: branchX, lowStockThreshold: 10 })
      .expect(200);

    const low = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchX}&lowStockOnly=true`,
    ).expect(200);
    expect(low.body.data).toHaveLength(1);
    expect(low.body.data[0].lowStockThreshold).toBe(10);
  });

  it('preserves consistency under concurrent stock-out requests racing the same balance', async () => {
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variantA.id,
        branchId: branchX,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    // 5 concurrent requests each trying to take 3 units from a balance of 10.
    // At most 3 can succeed (9 taken, leaving 1); the rest must be rejected -
    // never allowed to drive the balance negative.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        as(adminAToken, 'post', '/api/v1/inventory/stock-out').send({
          variantId: variantA.id,
          branchId: branchX,
          quantity: 3,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    const succeeded = attempts.filter((r) => r.status === 201);
    const rejected = attempts.filter((r) => r.status === 400);
    expect(succeeded.length).toBe(3);
    expect(rejected.length).toBe(2);

    const balances = await as(
      adminAToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchX}`,
    ).expect(200);
    expect(balances.body.data[0].onHandQty).toBe(1);
    expect(balances.body.data[0].onHandQty).toBeGreaterThanOrEqual(0);
  });
});
