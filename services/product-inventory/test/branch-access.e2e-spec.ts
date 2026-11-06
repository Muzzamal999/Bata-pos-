import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Branch-level access restriction (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();
  const branchAllowed = randomUUID();
  const branchForbidden = randomUUID();

  function tokenFor(branchIds: string[]) {
    return jwt.sign(
      {
        sub: randomUUID(),
        tenantId: tenantA,
        branchIds,
        roles: [],
        permissions: ALL_PERMISSION_CODES,
        type: 'access',
      },
      secret,
      { expiresIn: '15m' },
    );
  }

  // Restricted to branchAllowed only - the key scenario this suite verifies.
  const restrictedToken = tokenFor([branchAllowed]);
  // Empty branchIds means unrestricted (e.g. a Tenant Admin with no specific branch assignment).
  const unrestrictedToken = tokenFor([]);

  let variant: { id: string };

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
      data: { tenantId: tenantA, articleNumber: 'BRANCH-ART-1', name: 'Branch Test Shoe' },
    });
    variant = await prisma.productVariant.create({
      data: {
        tenantId: tenantA,
        productId: product.id,
        size: '1',
        color: 'Z',
        sku: 'BRANCH-SKU-1',
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

  function as(token: string, method: 'get' | 'post', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('allows a branch-restricted caller to act on their own assigned branch', async () => {
    await as(restrictedToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variant.id,
        branchId: branchAllowed,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
  });

  it('rejects a branch-restricted caller acting on a branch they are not assigned to', async () => {
    await as(restrictedToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variant.id,
        branchId: branchForbidden,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(404);
  });

  it('rejects a branch-restricted caller listing balances for another branch', async () => {
    await as(
      restrictedToken,
      'get',
      `/api/v1/inventory/balances?branchId=${branchForbidden}`,
    ).expect(404);
    await as(restrictedToken, 'get', `/api/v1/inventory/balances?branchId=${branchAllowed}`).expect(
      200,
    );
  });

  it('allows an unrestricted caller (empty branchIds) to act on any branch', async () => {
    await as(unrestrictedToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variant.id,
        branchId: branchForbidden,
        quantity: 5,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
  });

  it('rejects a branch-restricted caller creating a stock inward receipt for a branch they lack', async () => {
    await as(restrictedToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchForbidden })
      .expect(404);
    await as(restrictedToken, 'post', '/api/v1/stock-inward')
      .send({ branchId: branchAllowed })
      .expect(201);
  });

  it('allows a transfer when the caller is party to either branch, and rejects when party to neither', async () => {
    const thirdPartyBranch = randomUUID();

    await as(restrictedToken, 'post', '/api/v1/transfers')
      .send({
        sourceBranchId: branchAllowed,
        destinationBranchId: thirdPartyBranch,
        lines: [{ variantId: variant.id, requestedQty: 1 }],
      })
      .expect(201);

    await as(restrictedToken, 'post', '/api/v1/transfers')
      .send({
        sourceBranchId: branchForbidden,
        destinationBranchId: thirdPartyBranch,
        lines: [{ variantId: variant.id, requestedQty: 1 }],
      })
      .expect(404);

    await prisma.stockTransferLine.deleteMany();
    await prisma.stockTransfer.deleteMany();
  });
});
