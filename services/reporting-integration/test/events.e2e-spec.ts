import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventDispatcherService } from '../src/events/event-dispatcher.service';
import { EventEnvelope } from '../src/events/contracts/event-envelope.interface';
import { CONSUMED_EVENTS } from '../src/events/consumed-events.constant';

describe('Event consumption & idempotency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: EventDispatcherService;

  const tenantId = randomUUID();
  const branchId = randomUUID();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
    await prisma.deadLetterEvent.deleteMany();
  });

  function envelope<T>(eventType: string, payload: T): EventEnvelope<T> {
    return {
      id: randomUUID(),
      eventType,
      eventVersion: '1',
      tenantId,
      payload,
      occurredAt: new Date().toISOString(),
    };
  }

  it('ProductUpdated writes only an audit log entry, no projection row', async () => {
    const productId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.PRODUCT_UPDATED, {
      productId,
      changes: { name: 'New Name' },
    });

    const processed = await dispatcher.dispatch(event);

    expect(processed).toBe(true);
    const logs = await prisma.auditLog.findMany({ where: { entityId: productId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('product.updated');
  });

  it('PriceUpdated writes a PriceChangeRecord and an audit log entry', async () => {
    const priceId = randomUUID();
    const variantId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.PRICE_UPDATED, {
      priceId,
      productId: null,
      variantId,
      branchId: null,
      amount: '1500.00',
      currency: 'PKR',
    });

    await dispatcher.dispatch(event);

    const records = await prisma.priceChangeRecord.findMany({ where: { variantId } });
    expect(records).toHaveLength(1);
    expect(records[0].amount.toString()).toBe('1500');
    const logs = await prisma.auditLog.findMany({ where: { entityId: priceId } });
    expect(logs).toHaveLength(1);
  });

  it('StockReceived writes a StockMovementRecord', async () => {
    const movementId = randomUUID();
    const variantId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.STOCK_RECEIVED, {
      movementId,
      variantId,
      branchId,
      quantity: 50,
      balanceAfter: 50,
    });

    await dispatcher.dispatch(event);

    const records = await prisma.stockMovementRecord.findMany({ where: { variantId } });
    expect(records).toHaveLength(1);
    expect(records[0].quantity).toBe(50);
    expect(records[0].eventType).toBe(CONSUMED_EVENTS.STOCK_RECEIVED);
  });

  it('StockAdjusted writes a StockMovementRecord with the signed delta', async () => {
    const variantId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.STOCK_ADJUSTED, {
      movementId: randomUUID(),
      variantId,
      branchId,
      type: 'DAMAGE' as const,
      quantityDelta: -5,
      balanceAfter: 45,
    });

    await dispatcher.dispatch(event);

    const records = await prisma.stockMovementRecord.findMany({ where: { variantId } });
    expect(records[0].quantity).toBe(-5);
  });

  it('StockTransferReceived writes one StockMovementRecord per line, at the destination branch', async () => {
    const destinationBranchId = randomUUID();
    const variantId1 = randomUUID();
    const variantId2 = randomUUID();
    const event = envelope(CONSUMED_EVENTS.STOCK_TRANSFER_RECEIVED, {
      transferId: randomUUID(),
      referenceNumber: 'TRF-0001',
      sourceBranchId: branchId,
      destinationBranchId,
      lines: [
        { variantId: variantId1, dispatchedQty: 10, receivedQty: 10 },
        { variantId: variantId2, dispatchedQty: 4, receivedQty: 4 },
      ],
    });

    await dispatcher.dispatch(event);

    const records = await prisma.stockMovementRecord.findMany({
      where: { branchId: destinationBranchId },
    });
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.eventType === CONSUMED_EVENTS.STOCK_TRANSFER_RECEIVED)).toBe(
      true,
    );
  });

  it('SaleCompleted (assumed contract) writes a SaleRecord as COMPLETED', async () => {
    const saleId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.SALE_COMPLETED, {
      saleId,
      branchId,
      cashierId: randomUUID(),
      totalAmount: '2500.00',
      currency: 'PKR',
      paymentMethod: 'CASH',
    });

    await dispatcher.dispatch(event);

    const record = await prisma.saleRecord.findUnique({
      where: { tenantId_saleId: { tenantId, saleId } },
    });
    expect(record?.status).toBe('COMPLETED');
  });

  it('SaleCompleted with lines also writes one SaleLineRecord per line', async () => {
    const saleId = randomUUID();
    const variantId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.SALE_COMPLETED, {
      saleId,
      branchId,
      totalAmount: '600.00',
      lines: [{ variantId, quantity: 3, unitPrice: '200.00' }],
    });

    await dispatcher.dispatch(event);

    const lines = await prisma.saleLineRecord.findMany({ where: { saleId } });
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
    expect(lines[0].variantId).toBe(variantId);
  });

  it('SaleRefunded (assumed contract) marks a matching SaleRecord as REFUNDED', async () => {
    const saleId = randomUUID();
    await dispatcher.dispatch(
      envelope(CONSUMED_EVENTS.SALE_COMPLETED, {
        saleId,
        branchId,
        totalAmount: '1000.00',
      }),
    );

    await dispatcher.dispatch(
      envelope(CONSUMED_EVENTS.SALE_REFUNDED, { saleId, refundAmount: '1000.00' }),
    );

    const record = await prisma.saleRecord.findUnique({
      where: { tenantId_saleId: { tenantId, saleId } },
    });
    expect(record?.status).toBe('REFUNDED');
    expect(record?.refundAmount?.toString()).toBe('1000');
  });

  it('SaleRefunded for an unknown saleId does not throw, and is still audited', async () => {
    const saleId = randomUUID();
    const processed = await dispatcher.dispatch(
      envelope(CONSUMED_EVENTS.SALE_REFUNDED, { saleId }),
    );

    expect(processed).toBe(true);
    const logs = await prisma.auditLog.findMany({ where: { entityId: saleId } });
    expect(logs).toHaveLength(1);
  });

  it('is idempotent: dispatching the exact same event twice only applies it once', async () => {
    const variantId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.STOCK_RECEIVED, {
      movementId: randomUUID(),
      variantId,
      branchId,
      quantity: 20,
      balanceAfter: 20,
    });

    const first = await dispatcher.dispatch(event);
    const second = await dispatcher.dispatch(event);

    expect(first).toBe(true);
    expect(second).toBe(false);
    const records = await prisma.stockMovementRecord.findMany({ where: { variantId } });
    expect(records).toHaveLength(1);
  });

  it('two concurrent deliveries of the same event id still only apply it once', async () => {
    const variantId = randomUUID();
    const event = envelope(CONSUMED_EVENTS.STOCK_RECEIVED, {
      movementId: randomUUID(),
      variantId,
      branchId,
      quantity: 7,
      balanceAfter: 7,
    });

    const results = await Promise.all([dispatcher.dispatch(event), dispatcher.dispatch(event)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const records = await prisma.stockMovementRecord.findMany({ where: { variantId } });
    expect(records).toHaveLength(1);
  });

  it('an unrecognized event type is ignored without throwing', async () => {
    const processed = await dispatcher.dispatch(envelope('SomeUnknownEvent', {}));
    expect(processed).toBe(true);
  });
});
