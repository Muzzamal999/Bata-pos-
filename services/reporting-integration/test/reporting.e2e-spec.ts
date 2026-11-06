import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventDispatcherService } from '../src/events/event-dispatcher.service';
import { CONSUMED_EVENTS } from '../src/events/consumed-events.constant';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';

describe('Reporting endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: EventDispatcherService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const branchId = randomUUID();

  function tokenFor(forTenantId: string | null, permissions: string[]) {
    return jwt.sign(
      {
        sub: randomUUID(),
        tenantId: forTenantId,
        branchIds: [],
        roles: [],
        permissions,
        type: 'access',
      },
      secret,
      { expiresIn: '15m' },
    );
  }

  const tenantToken = tokenFor(tenantId, [PERMISSIONS.REPORTS_READ]);
  const noPermissionToken = tokenFor(tenantId, []);
  const platformToken = tokenFor(null, [PERMISSIONS.REPORTS_READ]);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    dispatcher = app.get(EventDispatcherService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.saleRecord.deleteMany();
    await prisma.stockMovementRecord.deleteMany();
    await prisma.priceChangeRecord.deleteMany();
    await prisma.processedEvent.deleteMany();
  });

  function as(token: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
    };
  }

  async function seedSale(
    forTenantId: string,
    totalAmount: string,
    overrides: Record<string, unknown> = {},
  ) {
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.SALE_COMPLETED,
      eventVersion: '1',
      tenantId: forTenantId,
      occurredAt: new Date().toISOString(),
      payload: {
        saleId: randomUUID(),
        branchId,
        cashierId: randomUUID(),
        totalAmount,
        currency: 'PKR',
        paymentMethod: 'CASH',
        ...overrides,
      },
    });
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/reports/sales').expect(401);
  });

  it('requires the reports.read permission', async () => {
    await as(noPermissionToken).get('/reports/sales').expect(403);
  });

  it('rejects a platform-level caller who omits tenantId', async () => {
    await as(platformToken).get('/reports/sales').expect(400);
  });

  it('a tenant-scoped caller cannot query another tenant via tenantId', async () => {
    await as(tenantToken).get(`/reports/sales?tenantId=${otherTenantId}`).expect(403);
  });

  it('returns a daily sales bucket reflecting dispatched SaleCompleted events', async () => {
    await seedSale(tenantId, '1000.00');
    await seedSale(tenantId, '500.00');
    await seedSale(otherTenantId, '9999.00');

    const res = await as(tenantToken).get('/reports/sales?period=daily').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].saleCount).toBe(2);
    expect(Number(res.body[0].grossAmount)).toBe(1500);
  });

  it('a platform-level caller can query an explicit tenant', async () => {
    await seedSale(tenantId, '100.00');

    const res = await as(platformToken).get(`/reports/sales?tenantId=${tenantId}`).expect(200);
    expect(res.body[0].saleCount).toBe(1);
  });

  it('sales/by-branch groups totals by branch', async () => {
    await seedSale(tenantId, '200.00');

    const res = await as(tenantToken).get('/reports/sales/by-branch').expect(200);
    expect(res.body[0].branchId).toBe(branchId);
    expect(Number(res.body[0].grossAmount)).toBe(200);
  });

  it('sales/by-cashier groups totals by cashier', async () => {
    const cashierId = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.SALE_COMPLETED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { saleId: randomUUID(), branchId, cashierId, totalAmount: '300.00' },
    });

    const res = await as(tenantToken).get('/reports/sales/by-cashier').expect(200);
    expect(res.body.some((r: { cashierId: string }) => r.cashierId === cashierId)).toBe(true);
  });

  it('payments/summary groups totals by payment method', async () => {
    await seedSale(tenantId, '400.00', { paymentMethod: 'CARD' });

    const res = await as(tenantToken).get('/reports/payments/summary').expect(200);
    expect(res.body.some((r: { paymentMethod: string }) => r.paymentMethod === 'CARD')).toBe(true);
  });

  it('inventory/movements lists StockReceived/Adjusted projections, paginated', async () => {
    const variantId = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.STOCK_RECEIVED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { movementId: randomUUID(), variantId, branchId, quantity: 15, balanceAfter: 15 },
    });

    const res = await as(tenantToken).get('/reports/inventory/movements?limit=5').expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].variantId).toBeDefined();
  });

  it('inventory/summary nets quantity per variant/branch', async () => {
    const variantId = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.STOCK_RECEIVED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { movementId: randomUUID(), variantId, branchId, quantity: 10, balanceAfter: 10 },
    });
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.STOCK_ADJUSTED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: {
        movementId: randomUUID(),
        variantId,
        branchId,
        type: 'DAMAGE',
        quantityDelta: -3,
        balanceAfter: 7,
      },
    });

    const res = await as(tenantToken).get('/reports/inventory/summary').expect(200);
    const row = res.body.find((r: { variantId: string }) => r.variantId === variantId);
    expect(row.netQuantity).toBe(7);
  });

  it('products/performance correlates price and stock activity per variant', async () => {
    const variantId = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.PRICE_UPDATED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: {
        priceId: randomUUID(),
        productId: null,
        variantId,
        branchId: null,
        amount: '1200.00',
        currency: 'PKR',
      },
    });

    const res = await as(tenantToken).get('/reports/products/performance').expect(200);
    const row = res.body.find((r: { variantId: string }) => r.variantId === variantId);
    expect(Number(row.latestAmount)).toBe(1200);
  });

  it('profit-loss honestly reports unavailable cost data', async () => {
    const res = await as(tenantToken).get('/reports/profit-loss').expect(200);
    expect(res.body.available).toBe(false);
  });
});
