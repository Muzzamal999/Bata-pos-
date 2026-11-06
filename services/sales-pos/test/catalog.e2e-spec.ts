import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductInventoryClientService } from '../src/product-inventory-client/product-inventory-client.service';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';

describe('Catalog endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: { listProducts: jest.Mock; listVariants: jest.Mock };

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();

  function tokenFor(permissions: string[]) {
    return jwt.sign(
      { sub: randomUUID(), tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const token = tokenFor([PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_SYNC]);
  const noPermissionToken = tokenFor([]);

  beforeAll(async () => {
    const mockClient = {
      listProducts: jest.fn(),
      listVariants: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ProductInventoryClientService)
      .useValue(mockClient)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    client = mockClient;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.catalogCacheEntry.deleteMany();
    jest.resetAllMocks();
  });

  function as(bearer: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${bearer}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(`/api/v1${url}`).set('Authorization', `Bearer ${bearer}`),
    };
  }

  it('requires the catalog.read permission', async () => {
    await as(noPermissionToken).get('/catalog/lookup?barcode=123').expect(403);
  });

  it('lookup finds a cached entry by exact barcode', async () => {
    const variantId = randomUUID();
    await prisma.catalogCacheEntry.create({
      data: {
        tenantId,
        variantId,
        productId: randomUUID(),
        productName: 'Classic Loafer',
        articleNumber: 'ART-001',
        barcodes: ['1234567890'],
      },
    });

    const res = await as(token).get('/catalog/lookup?barcode=1234567890').expect(200);
    expect(res.body.found).toBe(true);
    expect(res.body.entry.variantId).toBe(variantId);
  });

  it('lookup explicitly reports not-found for an unknown barcode', async () => {
    const res = await as(token).get('/catalog/lookup?barcode=nonexistent').expect(200);
    expect(res.body).toEqual({ found: false });
  });

  it('search matches by partial, case-insensitive product name', async () => {
    await prisma.catalogCacheEntry.create({
      data: {
        tenantId,
        variantId: randomUUID(),
        productId: randomUUID(),
        productName: 'Classic Loafer',
        articleNumber: 'ART-002',
        barcodes: [],
      },
    });

    const res = await as(token).get('/catalog/search?query=loafer').expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('sync paginates products and upserts a cache entry per variant', async () => {
    const productId = randomUUID();
    const variantId = randomUUID();
    client.listProducts.mockResolvedValueOnce({
      data: [{ id: productId, name: 'Running Shoe', articleNumber: 'ART-003' }],
      total: 1,
    });
    client.listVariants.mockResolvedValueOnce([{ id: variantId, barcodes: [{ code: '999' }] }]);

    const res = await as(token).post('/catalog/sync').expect(201);
    expect(res.body.synced).toBe(1);

    const entry = await prisma.catalogCacheEntry.findUnique({
      where: { tenantId_variantId: { tenantId, variantId } },
    });
    expect(entry?.barcodes).toEqual(['999']);
  });
});
