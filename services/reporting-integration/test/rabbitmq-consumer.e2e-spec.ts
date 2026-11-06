import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import configuration from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductInventoryEventsHandler } from '../src/events/handlers/product-inventory-events.handler';
import { SalesPosEventsHandler } from '../src/events/handlers/sales-pos-events.handler';
import { EventDispatcherService } from '../src/events/event-dispatcher.service';
import { RabbitMqConsumerService } from '../src/events/rabbitmq-consumer.service';
import { toRoutingKey } from '../src/events/consumed-events.constant';

/**
 * Exercises the REAL RabbitMQ wiring end-to-end: publishes to the actual
 * exchanges a genuine external publisher would use, and asserts the
 * consumer's own queue binding, dispatch, retry and dead-letter logic
 * produce the right rows in this service's own database. Deliberately
 * bypasses the AppModule's test-mode EVENT_CONSUMER_ENABLED=false flag by
 * building a small standalone module with the consumer forced on.
 */
describe('RabbitMQ consumer wiring (e2e, real broker)', () => {
  let prisma: PrismaService;
  let consumer: RabbitMqConsumerService;
  let publisherConnection: amqp.ChannelModel;
  let publisherChannel: amqp.Channel;

  const productInventoryExchange = 'product_inventory.events';
  const salesPosExchange = 'sales_pos.events';
  const tenantId = randomUUID();

  async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 8000): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await check();
      if (result) return result;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('waitFor timed out');
  }

  beforeAll(async () => {
    const config = configuration();
    config.rabbitmq.consumerEnabled = true;
    const configService = new ConfigService(config);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: configService },
        PrismaService,
        ProductInventoryEventsHandler,
        SalesPosEventsHandler,
        EventDispatcherService,
        RabbitMqConsumerService,
      ],
    }).compile();

    prisma = moduleFixture.get(PrismaService);
    await prisma.onModuleInit();

    consumer = moduleFixture.get(RabbitMqConsumerService);
    await consumer.onModuleInit();

    publisherConnection = await amqp.connect(config.rabbitmq.url);
    publisherChannel = await publisherConnection.createChannel();
    await publisherChannel.assertExchange(productInventoryExchange, 'topic', { durable: true });
    await publisherChannel.assertExchange(salesPosExchange, 'topic', { durable: true });
  });

  afterAll(async () => {
    await publisherChannel.close();
    await publisherConnection.close();
    await consumer.onModuleDestroy();
    await prisma.onModuleDestroy();
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.priceChangeRecord.deleteMany();
    await prisma.saleRecord.deleteMany();
    await prisma.processedEvent.deleteMany();
    await prisma.deadLetterEvent.deleteMany();
  });

  function publish(exchange: string, eventType: string, payload: object, id = randomUUID()) {
    const envelope = {
      id,
      eventType,
      eventVersion: '1',
      tenantId,
      payload,
      occurredAt: new Date().toISOString(),
    };
    publisherChannel.publish(
      exchange,
      toRoutingKey(eventType),
      Buffer.from(JSON.stringify(envelope)),
    );
  }

  it('consumes a real PriceUpdated message from the Product & Inventory exchange', async () => {
    const variantId = randomUUID();
    publish(productInventoryExchange, 'PriceUpdated', {
      priceId: randomUUID(),
      productId: null,
      variantId,
      branchId: null,
      amount: '999.00',
      currency: 'PKR',
    });

    const record = await waitFor(() =>
      prisma.priceChangeRecord.findFirst({ where: { variantId } }),
    );
    expect(record.amount.toString()).toBe('999');
  });

  it('consumes a real SaleCompleted message from the assumed Sales & POS exchange', async () => {
    const saleId = randomUUID();
    publish(salesPosExchange, 'SaleCompleted', {
      saleId,
      branchId: randomUUID(),
      totalAmount: '3000.00',
    });

    const record = await waitFor(() =>
      prisma.saleRecord.findUnique({ where: { tenantId_saleId: { tenantId, saleId } } }),
    );
    expect(record.status).toBe('COMPLETED');
  });

  it('retries a failing message and eventually dead-letters it', async () => {
    // tenantId is not a valid UUID, so the handler's Prisma write will throw
    // on every attempt - a real, deterministic failure, not a simulated one.
    const eventId = randomUUID();
    const badEnvelope = {
      id: eventId,
      eventType: 'PriceUpdated',
      eventVersion: '1',
      tenantId: 'not-a-valid-uuid',
      payload: {
        priceId: randomUUID(),
        productId: null,
        variantId: randomUUID(),
        branchId: null,
        amount: '100.00',
        currency: 'PKR',
      },
      occurredAt: new Date().toISOString(),
    };
    publisherChannel.publish(
      productInventoryExchange,
      toRoutingKey('PriceUpdated'),
      Buffer.from(JSON.stringify(badEnvelope)),
    );

    const dead = await waitFor(
      () => prisma.deadLetterEvent.findFirst({ where: { eventType: 'PriceUpdated' } }),
      15000,
    );
    expect(dead.retryCount).toBe(3);
  }, 20000);
});
