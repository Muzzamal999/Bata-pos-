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

describe('Analytics endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: EventDispatcherService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();
  const branchId = randomUUID();

  function tokenFor(permissions: string[]) {
    return jwt.sign(
      { sub: randomUUID(), tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const token = tokenFor([PERMISSIONS.ANALYTICS_READ]);
  const noPermissionToken = tokenFor([]);

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
    await prisma.saleLineRecord.deleteMany();
    await prisma.saleRecord.deleteMany();
    await prisma.stockMovementRecord.deleteMany();
    await prisma.priceChangeRecord.deleteMany();
    await prisma.processedEvent.deleteMany();
  });

  function as(bearer: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${bearer}`),
    };
  }

  it('requires the analytics.read permission', async () => {
    await as(noPermissionToken).get('/analytics/dashboard-kpis').expect(403);
  });

  it('sales-trend annotates each bucket with period-over-period change', async () => {
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.SALE_COMPLETED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { saleId: randomUUID(), branchId, totalAmount: '500.00' },
    });

    const res = await as(token).get('/analytics/sales-trend').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].changePercent).toBeNull();
  });

  it('best-selling-products ranks variants by total quantity sold', async () => {
    const popularVariant = randomUUID();
    const rareVariant = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.SALE_COMPLETED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: {
        saleId: randomUUID(),
        branchId,
        totalAmount: '1000.00',
        lines: [
          { variantId: popularVariant, quantity: 20, unitPrice: '30.00' },
          { variantId: rareVariant, quantity: 1, unitPrice: '40.00' },
        ],
      },
    });

    const res = await as(token).get('/analytics/best-selling-products?limit=5').expect(200);
    expect(res.body[0].variantId).toBe(popularVariant);
    expect(res.body[0].totalQuantity).toBe(20);
  });

  it('branch-comparison merges sales and inventory movement activity per branch', async () => {
    const variantId = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.SALE_COMPLETED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { saleId: randomUUID(), branchId, totalAmount: '150.00' },
    });
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.STOCK_RECEIVED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { movementId: randomUUID(), variantId, branchId, quantity: 5, balanceAfter: 5 },
    });

    const res = await as(token).get('/analytics/branch-comparison').expect(200);
    expect(res.body[0].branchId).toBe(branchId);
    expect(res.body[0].inventoryMovementCount).toBe(1);
  });

  it('inventory-performance ranks variants by movement count', async () => {
    const busyVariant = randomUUID();
    for (let i = 0; i < 3; i++) {
      await dispatcher.dispatch({
        id: randomUUID(),
        eventType: CONSUMED_EVENTS.STOCK_RECEIVED,
        eventVersion: '1',
        tenantId,
        occurredAt: new Date().toISOString(),
        payload: {
          movementId: randomUUID(),
          variantId: busyVariant,
          branchId,
          quantity: 1,
          balanceAfter: i + 1,
        },
      });
    }

    const res = await as(token).get('/analytics/inventory-performance').expect(200);
    expect(res.body[0].variantId).toBe(busyVariant);
    expect(res.body[0].movementCount).toBe(3);
  });

  it('sales-summary totals gross, refunded and net across the tenant', async () => {
    const saleId = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.SALE_COMPLETED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { saleId, branchId, totalAmount: '1000.00' },
    });
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.SALE_REFUNDED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: { saleId, refundAmount: '400.00' },
    });

    const res = await as(token).get('/analytics/sales-summary').expect(200);
    expect(res.body.totalGross).toBe('1000.00');
    expect(res.body.totalRefunded).toBe('400.00');
    expect(res.body.totalNet).toBe('600.00');
  });

  it('dashboard-kpis reports out-of-stock variants using the real balanceAfter signal, not a windowed net sum', async () => {
    const outOfStockVariant = randomUUID();
    const healthyVariant = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.STOCK_RECEIVED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
      payload: {
        movementId: randomUUID(),
        variantId: outOfStockVariant,
        branchId,
        quantity: 10,
        balanceAfter: 10,
      },
    });
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.STOCK_ADJUSTED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: {
        movementId: randomUUID(),
        variantId: outOfStockVariant,
        branchId,
        type: 'DAMAGE',
        quantityDelta: -10,
        balanceAfter: 0,
      },
    });
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.STOCK_RECEIVED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: {
        movementId: randomUUID(),
        variantId: healthyVariant,
        branchId,
        quantity: 50,
        balanceAfter: 50,
      },
    });

    const res = await as(token).get('/analytics/dashboard-kpis').expect(200);
    expect(res.body.outOfStockVariantCount).toBe(1);
    expect(res.body.trackedVariantCount).toBe(2);
  });
});
