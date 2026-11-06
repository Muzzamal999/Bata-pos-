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

describe('Sales endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: {
    resolvePrice: jest.Mock;
    stockOut: jest.Mock;
    stockIn: jest.Mock;
  };

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const allPermissions = [
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_READ,
    PERMISSIONS.SALES_REFUND,
    PERMISSIONS.SALES_VOID,
  ];

  function token(permissions: string[] = allPermissions) {
    return jwt.sign(
      { sub: userId, tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  beforeAll(async () => {
    const mockClient = {
      resolvePrice: jest.fn(),
      stockOut: jest.fn().mockResolvedValue({ id: randomUUID(), balanceAfter: 10 }),
      stockIn: jest.fn().mockResolvedValue({ id: randomUUID(), balanceAfter: 10 }),
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
    await prisma.outboxEvent.deleteMany();
    await prisma.refundLine.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.saleLine.deleteMany();
    await prisma.salePayment.deleteMany();
    await prisma.sale.deleteMany();
    jest.resetAllMocks();
    client.stockOut.mockResolvedValue({ id: randomUUID(), balanceAfter: 10 });
    client.stockIn.mockResolvedValue({ id: randomUUID(), balanceAfter: 10 });
  });

  function as(bearer: string) {
    return {
      post: (url: string, body: object = {}) =>
        request(app.getHttpServer())
          .post(`/api/v1${url}`)
          .set('Authorization', `Bearer ${bearer}`)
          .send(body),
      get: (url: string) =>
        request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${bearer}`),
    };
  }

  function checkoutBody(overrides: Record<string, unknown> = {}) {
    return {
      branchId,
      idempotencyKey: randomUUID(),
      lines: [{ variantId: randomUUID(), quantity: 2 }],
      payments: [{ method: 'CASH', amount: 200 }],
      ...overrides,
    };
  }

  it('requires the sales.create permission', async () => {
    await as(token([])).post('/sales', checkoutBody()).expect(403);
  });

  it('checkout resolves price live, deducts stock, and persists the sale', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });
    const variantId = randomUUID();

    const res = await as(token())
      .post(
        '/sales',
        checkoutBody({
          lines: [{ variantId, quantity: 2 }],
          payments: [{ method: 'CASH', amount: 200 }],
        }),
      )
      .expect(201);

    expect(Number(res.body.totalAmount)).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(client.stockOut).toHaveBeenCalledWith(
      expect.any(String),
      variantId,
      branchId,
      2,
      expect.stringContaining(variantId),
      'POS sale',
    );

    const events = await prisma.outboxEvent.findMany({ where: { eventType: 'SaleCompleted' } });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as { totalAmount: string; lines: unknown[] };
    expect(Number(payload.totalAmount)).toBe(200);
    expect(payload.lines).toHaveLength(1);
  });

  it('rejects checkout when payment total does not match the sale total', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });

    await as(token())
      .post('/sales', checkoutBody({ payments: [{ method: 'CASH', amount: 50 }] }))
      .expect(400);
  });

  it('replaying the same idempotency key returns the original sale without deducting stock twice', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });
    const body = checkoutBody();

    const first = await as(token()).post('/sales', body).expect(201);
    const second = await as(token()).post('/sales', body).expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(client.stockOut).toHaveBeenCalledTimes(1);
  });

  it('a split-tender checkout records a SPLIT payment method on the outbox event', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });

    await as(token())
      .post(
        '/sales',
        checkoutBody({
          payments: [
            { method: 'CASH', amount: 100 },
            { method: 'CARD', amount: 100 },
          ],
        }),
      )
      .expect(201);

    const events = await prisma.outboxEvent.findMany({ where: { eventType: 'SaleCompleted' } });
    const payload = events[0].payload as { paymentMethod: string };
    expect(payload.paymentMethod).toBe('SPLIT');
  });

  it('refunds part of a sale and marks it PARTIALLY_REFUNDED', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });
    const checkout = await as(token())
      .post(
        '/sales',
        checkoutBody({
          lines: [{ variantId: randomUUID(), quantity: 4 }],
          payments: [{ method: 'CASH', amount: 400 }],
        }),
      )
      .expect(201);
    const saleLineId = checkout.body.lines[0].id;

    const refund = await as(token())
      .post(`/sales/${checkout.body.id}/refund`, {
        idempotencyKey: randomUUID(),
        lines: [{ saleLineId, quantity: 1 }],
      })
      .expect(201);

    expect(Number(refund.body.amount)).toBe(100);

    const sale = await as(token()).get(`/sales/${checkout.body.id}`).expect(200);
    expect(sale.body.status).toBe('PARTIALLY_REFUNDED');

    const events = await prisma.outboxEvent.findMany({ where: { eventType: 'SaleRefunded' } });
    expect(events).toHaveLength(1);
  });

  it('rejects refunding more than the remaining quantity on a line', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });
    const checkout = await as(token())
      .post(
        '/sales',
        checkoutBody({
          lines: [{ variantId: randomUUID(), quantity: 2 }],
          payments: [{ method: 'CASH', amount: 200 }],
        }),
      )
      .expect(201);
    const saleLineId = checkout.body.lines[0].id;

    await as(token())
      .post(`/sales/${checkout.body.id}/refund`, {
        idempotencyKey: randomUUID(),
        lines: [{ saleLineId, quantity: 5 }],
      })
      .expect(400);
  });

  it('fully refunding every line marks the sale REFUNDED', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });
    const checkout = await as(token())
      .post(
        '/sales',
        checkoutBody({
          lines: [{ variantId: randomUUID(), quantity: 2 }],
          payments: [{ method: 'CASH', amount: 200 }],
        }),
      )
      .expect(201);
    const saleLineId = checkout.body.lines[0].id;

    await as(token())
      .post(`/sales/${checkout.body.id}/refund`, {
        idempotencyKey: randomUUID(),
        lines: [{ saleLineId, quantity: 2 }],
      })
      .expect(201);

    const sale = await as(token()).get(`/sales/${checkout.body.id}`).expect(200);
    expect(sale.body.status).toBe('REFUNDED');
  });

  it('void restocks every line and marks the sale VOIDED', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });
    const checkout = await as(token())
      .post(
        '/sales',
        checkoutBody({
          lines: [{ variantId: randomUUID(), quantity: 3 }],
          payments: [{ method: 'CASH', amount: 300 }],
        }),
      )
      .expect(201);

    await as(token())
      .post(`/sales/${checkout.body.id}/void`, { idempotencyKey: randomUUID(), reason: 'Mistake' })
      .expect(201);

    expect(client.stockIn).toHaveBeenCalledTimes(1);
    const sale = await as(token()).get(`/sales/${checkout.body.id}`).expect(200);
    expect(sale.body.status).toBe('VOIDED');
  });

  it('rejects voiding a sale that already has a refund', async () => {
    client.resolvePrice.mockResolvedValue({ id: randomUUID(), amount: '100.00', currency: 'PKR' });
    const checkout = await as(token())
      .post(
        '/sales',
        checkoutBody({
          lines: [{ variantId: randomUUID(), quantity: 2 }],
          payments: [{ method: 'CASH', amount: 200 }],
        }),
      )
      .expect(201);
    const saleLineId = checkout.body.lines[0].id;

    await as(token())
      .post(`/sales/${checkout.body.id}/refund`, {
        idempotencyKey: randomUUID(),
        lines: [{ saleLineId, quantity: 1 }],
      })
      .expect(201);

    await as(token())
      .post(`/sales/${checkout.body.id}/void`, { idempotencyKey: randomUUID() })
      .expect(409);
  });
});
