import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import configuration from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';
import { OutboxService } from '../src/events/outbox.service';
import { RabbitMqService } from '../src/events/rabbitmq.service';
import { OutboxRelayService } from '../src/events/outbox-relay.service';
import { CatalogSyncConsumerService } from '../src/events/catalog-sync-consumer.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { ProductInventoryClientService } from '../src/product-inventory-client/product-inventory-client.service';
import { DOMAIN_EVENTS } from '../src/events/domain-events.constant';

describe('Outbox relay (e2e, real broker)', () => {
  let prisma: PrismaService;
  let outbox: OutboxService;
  let relay: OutboxRelayService;
  let rabbitMq: RabbitMqService;
  let subscriberConnection: amqp.ChannelModel;
  let subscriberChannel: amqp.Channel;
  const tenantId = randomUUID();

  beforeAll(async () => {
    const config = configuration();
    const configService = new ConfigService(config);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: configService },
        PrismaService,
        OutboxService,
        RabbitMqService,
        OutboxRelayService,
      ],
    }).compile();

    prisma = moduleFixture.get(PrismaService);
    await prisma.onModuleInit();
    rabbitMq = moduleFixture.get(RabbitMqService);
    await rabbitMq.onModuleInit();
    relay = moduleFixture.get(OutboxRelayService);
    outbox = moduleFixture.get(OutboxService);

    subscriberConnection = await amqp.connect(
      process.env.RABBITMQ_URL ?? 'amqp://bata:bata_pass@localhost:5672',
    );
    subscriberChannel = await subscriberConnection.createChannel();
    await subscriberChannel.assertExchange('sales_pos.events', 'topic', { durable: true });
  });

  afterAll(async () => {
    await subscriberChannel.close();
    await subscriberConnection.close();
    await rabbitMq.onModuleDestroy();
    await prisma.onModuleDestroy();
  });

  afterEach(async () => {
    await prisma.outboxEvent.deleteMany();
  });

  it('publishes a SaleCompleted outbox row to the real exchange and marks it published', async () => {
    const saleId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await outbox.enqueue(tx, {
        tenantId,
        eventType: DOMAIN_EVENTS.SALE_COMPLETED,
        payload: { saleId, branchId: randomUUID(), totalAmount: '500.00' },
      });
    });

    const { queue } = await subscriberChannel.assertQueue('', { exclusive: true });
    await subscriberChannel.bindQueue(queue, 'sales_pos.events', 'sale.completed');

    const received = new Promise<Record<string, unknown>>((resolve) => {
      subscriberChannel.consume(queue, (msg) => {
        if (msg) {
          resolve(JSON.parse(msg.content.toString()));
          subscriberChannel.ack(msg);
        }
      });
    });

    const publishedCount = await relay.publishPending();
    expect(publishedCount).toBe(1);

    const message = await received;
    expect(message.eventType).toBe('SaleCompleted');
    expect((message.payload as { saleId: string }).saleId).toBe(saleId);

    const row = await prisma.outboxEvent.findFirst({ where: { tenantId } });
    expect(row?.publishedAt).not.toBeNull();
  });
});

describe('Catalog sync consumer (e2e, real broker)', () => {
  let prisma: PrismaService;
  let consumer: CatalogSyncConsumerService;
  let publisherConnection: amqp.ChannelModel;
  let publisherChannel: amqp.Channel;
  const tenantId = randomUUID();

  beforeAll(async () => {
    const config = configuration();
    config.rabbitmq.consumerEnabled = true;
    const configService = new ConfigService(config);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: configService },
        PrismaService,
        { provide: ProductInventoryClientService, useValue: {} },
        CatalogService,
        CatalogSyncConsumerService,
      ],
    }).compile();

    prisma = moduleFixture.get(PrismaService);
    await prisma.onModuleInit();
    consumer = moduleFixture.get(CatalogSyncConsumerService);
    await consumer.onModuleInit();

    publisherConnection = await amqp.connect(
      process.env.RABBITMQ_URL ?? 'amqp://bata:bata_pass@localhost:5672',
    );
    publisherChannel = await publisherConnection.createChannel();
    await publisherChannel.assertExchange('product_inventory.events', 'topic', { durable: true });
  });

  afterAll(async () => {
    await publisherChannel.close();
    await publisherConnection.close();
    await consumer.onModuleDestroy();
    await prisma.onModuleDestroy();
  });

  afterEach(async () => {
    await prisma.catalogCacheEntry.deleteMany();
  });

  async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 8000): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await check();
      if (result) return result;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('waitFor timed out');
  }

  it('consumes a real PriceUpdated message and refreshes the cached price', async () => {
    const variantId = randomUUID();
    await prisma.catalogCacheEntry.create({
      data: {
        tenantId,
        variantId,
        productId: randomUUID(),
        productName: 'Classic Loafer',
        articleNumber: 'ART-1',
        barcodes: [],
      },
    });

    const envelope = {
      id: randomUUID(),
      eventType: 'PriceUpdated',
      eventVersion: '1',
      tenantId,
      payload: { variantId, productId: null, branchId: null, amount: '1234.00', currency: 'PKR' },
      occurredAt: new Date().toISOString(),
    };
    publisherChannel.publish(
      'product_inventory.events',
      'price.updated',
      Buffer.from(JSON.stringify(envelope)),
    );

    const entry = await waitFor(async () => {
      const row = await prisma.catalogCacheEntry.findUnique({
        where: { tenantId_variantId: { tenantId, variantId } },
      });
      return row && row.price ? row : null;
    });
    expect(entry.price?.toString()).toBe('1234');
  });
});
