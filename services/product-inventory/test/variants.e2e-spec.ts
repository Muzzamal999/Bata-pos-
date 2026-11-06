import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Variants & Barcodes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  function tokenFor(tenantId: string | null, permissions: string[]) {
    return jwt.sign(
      { sub: randomUUID(), tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const adminAToken = tokenFor(tenantA, ALL_PERMISSION_CODES);
  const noPermsToken = tokenFor(tenantA, []);

  let productA: { id: string; articleNumber: string; tenantId: string };

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
      data: { tenantId: tenantA, articleNumber: 'VAR-ART-1', name: 'Variant Test Shoe' },
    });
  });

  afterEach(async () => {
    await prisma.barcode.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch' | 'delete', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('rejects an unprivileged caller', async () => {
    await as(noPermsToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '42', color: 'Black' })
      .expect(403);
  });

  it('creates a variant with an auto-generated SKU when none is provided', async () => {
    const res = await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '42', color: 'Black' })
      .expect(201);
    expect(res.body.sku).toBe('VAR-ART-1-42-BLACK');
    expect(res.body.tenantId).toBe(tenantA);
  });

  it('accepts a manually provided SKU', async () => {
    const res = await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '43', color: 'Brown', sku: 'CUSTOM-SKU-1' })
      .expect(201);
    expect(res.body.sku).toBe('CUSTOM-SKU-1');
  });

  it('rejects a duplicate size/color combination for the same product', async () => {
    await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '42', color: 'Black' })
      .expect(201);
    await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '42', color: 'Black' })
      .expect(409);
  });

  it('rejects a duplicate SKU within the same tenant across different products', async () => {
    const productA2 = await prisma.product.create({
      data: { tenantId: tenantA, articleNumber: 'VAR-ART-2', name: 'Another Shoe' },
    });
    await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '1', color: 'X', sku: 'SHARED-SKU' })
      .expect(201);
    await as(adminAToken, 'post', `/api/v1/products/${productA2.id}/variants`)
      .send({ size: '1', color: 'X', sku: 'SHARED-SKU' })
      .expect(409);
  });

  it('returns 404 creating a variant under a product from another tenant', async () => {
    const productB = await prisma.product.create({
      data: { tenantId: tenantB, articleNumber: 'B-ART-1', name: 'Other Tenant Shoe' },
    });
    await as(adminAToken, 'post', `/api/v1/products/${productB.id}/variants`)
      .send({ size: '1', color: 'X' })
      .expect(404);
  });

  it('activates and deactivates a variant', async () => {
    const variant = await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '44', color: 'White' })
      .expect(201)
      .then((r) => r.body);

    const deactivated = await as(
      adminAToken,
      'patch',
      `/api/v1/variants/${variant.id}/deactivate`,
    ).expect(200);
    expect(deactivated.body.isActive).toBe(false);

    const reactivated = await as(
      adminAToken,
      'patch',
      `/api/v1/variants/${variant.id}/activate`,
    ).expect(200);
    expect(reactivated.body.isActive).toBe(true);
  });

  it('adds a barcode, rejects a duplicate global code, and removes it', async () => {
    const variant1 = await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '45', color: 'Red' })
      .expect(201)
      .then((r) => r.body);
    const variant2 = await as(adminAToken, 'post', `/api/v1/products/${productA.id}/variants`)
      .send({ size: '46', color: 'Red' })
      .expect(201)
      .then((r) => r.body);

    const barcode = await as(adminAToken, 'post', `/api/v1/variants/${variant1.id}/barcodes`)
      .send({ code: '1234567890123' })
      .expect(201);

    // Same barcode code must be globally unique, even across different variants/tenants.
    await as(adminAToken, 'post', `/api/v1/variants/${variant2.id}/barcodes`)
      .send({ code: '1234567890123' })
      .expect(409);

    const withBarcode = await as(adminAToken, 'get', `/api/v1/variants/${variant1.id}`).expect(200);
    expect(withBarcode.body.barcodes).toHaveLength(1);

    await as(
      adminAToken,
      'delete',
      `/api/v1/variants/${variant1.id}/barcodes/${barcode.body.id}`,
    ).expect(204);

    const withoutBarcode = await as(adminAToken, 'get', `/api/v1/variants/${variant1.id}`).expect(
      200,
    );
    expect(withoutBarcode.body.barcodes).toHaveLength(0);
  });
});
