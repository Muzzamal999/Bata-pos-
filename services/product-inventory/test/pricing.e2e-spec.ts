import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Pricing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userId = randomUUID();
  const branchX = randomUUID();

  function tokenFor(tenantId: string | null, permissions: string[]) {
    return jwt.sign(
      { sub: userId, tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const adminAToken = tokenFor(tenantA, ALL_PERMISSION_CODES);
  const noPermsToken = tokenFor(tenantA, []);

  let productA: { id: string; tenantId: string };

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
    productA = await prisma.product.create({
      data: { tenantId: tenantA, articleNumber: 'PRICE-ART-1', name: 'Priced Shoe' },
    });
  });

  afterEach(async () => {
    await prisma.priceHistory.deleteMany();
    await prisma.price.deleteMany();
    await prisma.product.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('rejects an unprivileged caller', async () => {
    await as(noPermsToken, 'post', '/api/v1/prices')
      .send({ productId: productA.id, amount: 100 })
      .expect(403);
  });

  it('rejects a price with neither or both of productId/variantId', async () => {
    await as(adminAToken, 'post', '/api/v1/prices').send({ amount: 100 }).expect(400);

    const variant = await prisma.productVariant.create({
      data: { tenantId: tenantA, productId: productA.id, size: '1', color: 'X', sku: 'X-1' },
    });
    await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: productA.id, variantId: variant.id, amount: 100 })
      .expect(400);
  });

  it('creates a tenant-wide price and records a history entry', async () => {
    const res = await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: productA.id, amount: 2499.5 })
      .expect(201);
    expect(res.body.tenantId).toBe(tenantA);
    expect(Number(res.body.amount)).toBeCloseTo(2499.5);

    const history = await as(adminAToken, 'get', `/api/v1/prices/${res.body.id}/history`).expect(
      200,
    );
    expect(history.body).toHaveLength(1);
    expect(history.body[0].action).toBe('created');
    expect(history.body[0].changedByUserId).toBe(userId);
  });

  it('returns 404 creating a price for a product from another tenant', async () => {
    const productB = await prisma.product.create({
      data: { tenantId: tenantB, articleNumber: 'B-PRICE-1', name: 'Other Tenant Shoe' },
    });
    await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: productB.id, amount: 100 })
      .expect(404);
  });

  it('updates a price and appends a new history entry without erasing the old one', async () => {
    const created = await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: productA.id, amount: 1000 })
      .expect(201);

    await as(adminAToken, 'patch', `/api/v1/prices/${created.body.id}`)
      .send({ amount: 1200 })
      .expect(200);

    const history = await as(
      adminAToken,
      'get',
      `/api/v1/prices/${created.body.id}/history`,
    ).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body.map((h: { action: string }) => h.action).sort()).toEqual([
      'created',
      'updated',
    ]);
  });

  it('resolves the branch-specific price over the tenant-wide default when both are current', async () => {
    await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: productA.id, amount: 1000 })
      .expect(201);
    await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: productA.id, branchId: branchX, amount: 900 })
      .expect(201);

    const resolved = await as(
      adminAToken,
      'get',
      `/api/v1/prices/resolve?productId=${productA.id}&branchId=${branchX}`,
    ).expect(200);
    expect(Number(resolved.body.amount)).toBe(900);
  });

  it('falls back to the tenant-wide price when no branch-specific price exists', async () => {
    await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: productA.id, amount: 1000 })
      .expect(201);

    const resolved = await as(
      adminAToken,
      'get',
      `/api/v1/prices/resolve?productId=${productA.id}&branchId=${branchX}`,
    ).expect(200);
    expect(Number(resolved.body.amount)).toBe(1000);
  });

  it('returns 404 when resolving a price outside any effective window', async () => {
    await as(adminAToken, 'post', '/api/v1/prices')
      .send({
        productId: productA.id,
        amount: 1000,
        effectiveFrom: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);

    await as(adminAToken, 'get', `/api/v1/prices/resolve?productId=${productA.id}`).expect(404);
  });
});
