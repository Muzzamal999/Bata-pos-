import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Catalogue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  function tokenFor(tenantId: string | null, permissions: string[]) {
    return jwt.sign(
      {
        sub: randomUUID(),
        tenantId,
        branchIds: [],
        roles: [],
        permissions,
        type: 'access',
      },
      secret,
      { expiresIn: '15m' },
    );
  }

  const adminAToken = tokenFor(tenantA, ALL_PERMISSION_CODES);
  const noPermsToken = tokenFor(tenantA, []);
  const platformAdminToken = tokenFor(null, ALL_PERMISSION_CODES);

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

  afterEach(async () => {
    await prisma.productImage.deleteMany();
    await prisma.product.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.category.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch' | 'delete', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  describe('Brands', () => {
    it('rejects an unprivileged caller', async () => {
      await as(noPermsToken, 'post', '/api/v1/brands').send({ name: 'X' }).expect(403);
    });

    it('creates a brand scoped to the caller tenant and rejects a mismatched tenantId', async () => {
      await as(adminAToken, 'post', '/api/v1/brands')
        .send({ tenantId: tenantB, name: 'Escape' })
        .expect(403);

      const res = await as(adminAToken, 'post', '/api/v1/brands')
        .send({ name: 'BATA' })
        .expect(201);
      expect(res.body.tenantId).toBe(tenantA);
    });

    it('requires a platform-level caller to specify a tenantId', async () => {
      await as(platformAdminToken, 'post', '/api/v1/brands').send({ name: 'Orphan' }).expect(400);
    });

    it('rejects a duplicate brand name within the same tenant', async () => {
      await as(adminAToken, 'post', '/api/v1/brands').send({ name: 'Dup' }).expect(201);
      await as(adminAToken, 'post', '/api/v1/brands').send({ name: 'Dup' }).expect(409);
    });

    it('returns 404 fetching a brand from another tenant', async () => {
      const brandB = await prisma.brand.create({ data: { tenantId: tenantB, name: 'B Brand' } });
      await as(adminAToken, 'get', `/api/v1/brands/${brandB.id}`).expect(404);
    });
  });

  describe('Categories', () => {
    it('creates and lists categories scoped to the caller tenant', async () => {
      await as(adminAToken, 'post', '/api/v1/categories').send({ name: 'Formal' }).expect(201);
      await prisma.category.create({ data: { tenantId: tenantB, name: 'B Category' } });

      const res = await as(adminAToken, 'get', '/api/v1/categories').expect(200);
      const names = res.body.data.map((c: { name: string }) => c.name);
      expect(names).toContain('Formal');
      expect(names).not.toContain('B Category');
    });
  });

  describe('Products', () => {
    it('creates a product and rejects a duplicate article number within the tenant', async () => {
      const res = await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'ART-1', name: 'Oxford Shoe' })
        .expect(201);
      expect(res.body.tenantId).toBe(tenantA);

      await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'ART-1', name: 'Another Shoe' })
        .expect(409);
    });

    it('rejects a brand/category that belongs to a different tenant', async () => {
      const brandB = await prisma.brand.create({
        data: { tenantId: tenantB, name: 'Foreign Brand' },
      });
      await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'ART-2', name: 'Shoe', brandId: brandB.id })
        .expect(400);
    });

    it('accepts a brand/category belonging to the same tenant and returns them included', async () => {
      const brand = await as(adminAToken, 'post', '/api/v1/brands')
        .send({ name: 'Own Brand' })
        .then((r) => r.body);
      const category = await as(adminAToken, 'post', '/api/v1/categories')
        .send({ name: 'Own Category' })
        .then((r) => r.body);

      const res = await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'ART-3', name: 'Shoe', brandId: brand.id, categoryId: category.id })
        .expect(201);
      expect(res.body.brand.id).toBe(brand.id);
      expect(res.body.category.id).toBe(category.id);
    });

    it('filters products by search term', async () => {
      await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'SRCH-1', name: 'Red Sneaker' })
        .expect(201);
      await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'SRCH-2', name: 'Blue Boot' })
        .expect(201);

      const res = await as(adminAToken, 'get', '/api/v1/products?search=sneaker').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Red Sneaker');
    });

    it('returns 404 fetching a product from another tenant', async () => {
      const productB = await prisma.product.create({
        data: { tenantId: tenantB, articleNumber: 'B-1', name: 'Other Tenant Shoe' },
      });
      await as(adminAToken, 'get', `/api/v1/products/${productB.id}`).expect(404);
    });

    it('activates and deactivates a product', async () => {
      const created = await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'TOGGLE-1', name: 'Toggle Shoe' })
        .expect(201);

      const deactivated = await as(
        adminAToken,
        'patch',
        `/api/v1/products/${created.body.id}/deactivate`,
      ).expect(200);
      expect(deactivated.body.isActive).toBe(false);

      const reactivated = await as(
        adminAToken,
        'patch',
        `/api/v1/products/${created.body.id}/activate`,
      ).expect(200);
      expect(reactivated.body.isActive).toBe(true);
    });

    it('adds and removes a product image', async () => {
      const created = await as(adminAToken, 'post', '/api/v1/products')
        .send({ articleNumber: 'IMG-1', name: 'Image Shoe' })
        .expect(201);

      const image = await as(adminAToken, 'post', `/api/v1/products/${created.body.id}/images`)
        .send({ url: 'https://cdn.example.com/shoe.jpg' })
        .expect(201);

      const withImage = await as(adminAToken, 'get', `/api/v1/products/${created.body.id}`).expect(
        200,
      );
      expect(withImage.body.images).toHaveLength(1);

      await as(
        adminAToken,
        'delete',
        `/api/v1/products/${created.body.id}/images/${image.body.id}`,
      ).expect(204);

      const withoutImage = await as(
        adminAToken,
        'get',
        `/api/v1/products/${created.body.id}`,
      ).expect(200);
      expect(withoutImage.body.images).toHaveLength(0);
    });
  });
});
