import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import * as amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OutboxRelayService } from '../src/events/outbox-relay.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';

describe('Domain events & transactional outbox (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantA = randomUUID();

  function tokenFor(tenantId: string | null, permissions: string[]) {
    return jwt.sign(
      { sub: randomUUID(), tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const adminAToken = tokenFor(tenantA, ALL_PERMISSION_CODES);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    relay = app.get(OutboxRelayService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.stockBalance.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.price.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('writes a ProductCreated outbox event transactionally when a product is created', async () => {
    const product = await as(adminAToken, 'post', '/api/v1/products')
      .send({ articleNumber: 'EVT-ART-1', name: 'Event Shoe' })
      .expect(201)
      .then((r) => r.body);

    const events = await prisma.outboxEvent.findMany({ where: { tenantId: tenantA } });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('ProductCreated');
    expect(events[0].publishedAt).toBeNull();
    expect((events[0].payload as { productId: string }).productId).toBe(product.id);
  });

  it('writes a ProductUpdated event on update', async () => {
    const product = await as(adminAToken, 'post', '/api/v1/products')
      .send({ articleNumber: 'EVT-ART-2', name: 'Event Shoe 2' })
      .expect(201)
      .then((r) => r.body);
    await prisma.outboxEvent.deleteMany();

    await as(adminAToken, 'patch', `/api/v1/products/${product.id}`)
      .send({ name: 'Renamed' })
      .expect(200);

    const events = await prisma.outboxEvent.findMany({ where: { tenantId: tenantA } });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('ProductUpdated');
  });

  it('writes a PriceUpdated event on both price creation and update', async () => {
    const product = await as(adminAToken, 'post', '/api/v1/products')
      .send({ articleNumber: 'EVT-ART-3', name: 'Event Shoe 3' })
      .expect(201)
      .then((r) => r.body);
    await prisma.outboxEvent.deleteMany();

    const price = await as(adminAToken, 'post', '/api/v1/prices')
      .send({ productId: product.id, amount: 1000 })
      .expect(201)
      .then((r) => r.body);

    let events = await prisma.outboxEvent.findMany({ where: { tenantId: tenantA } });
    expect(events.filter((e) => e.eventType === 'PriceUpdated')).toHaveLength(1);

    await as(adminAToken, 'patch', `/api/v1/prices/${price.id}`).send({ amount: 1200 }).expect(200);

    events = await prisma.outboxEvent.findMany({ where: { tenantId: tenantA } });
    expect(events.filter((e) => e.eventType === 'PriceUpdated')).toHaveLength(2);
  });

  it('writes a StockReceived event on stock-in and a StockAdjusted event on an adjustment', async () => {
    const product = await as(adminAToken, 'post', '/api/v1/products')
      .send({ articleNumber: 'EVT-ART-4', name: 'Event Shoe 4' })
      .expect(201)
      .then((r) => r.body);
    const variant = await as(adminAToken, 'post', `/api/v1/products/${product.id}/variants`)
      .send({ size: '1', color: 'X' })
      .expect(201)
      .then((r) => r.body);
    await prisma.outboxEvent.deleteMany();

    const branchId = randomUUID();
    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({ variantId: variant.id, branchId, quantity: 10, idempotencyKey: randomUUID() })
      .expect(201);
    await as(adminAToken, 'post', '/api/v1/inventory/adjustments')
      .send({ variantId: variant.id, branchId, quantityDelta: -2, idempotencyKey: randomUUID() })
      .expect(201);

    const events = await prisma.outboxEvent.findMany({
      where: { tenantId: tenantA },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual(['StockReceived', 'StockAdjusted']);
  });

  it('actually delivers a published event to a real RabbitMQ consumer end to end', async () => {
    const product = await as(adminAToken, 'post', '/api/v1/products')
      .send({ articleNumber: 'EVT-ART-5', name: 'Event Shoe 5' })
      .expect(201)
      .then((r) => r.body);

    const eventBefore = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: tenantA } });
    expect(eventBefore.publishedAt).toBeNull();

    // Bind a throwaway queue to the exchange before relaying, so we can
    // independently verify what actually went over the wire to RabbitMQ -
    // not just that our own code believes it published something.
    const connection = await amqp.connect(process.env.RABBITMQ_URL!);
    const channel = await connection.createChannel();
    const exchange = process.env.RABBITMQ_EXCHANGE ?? 'product_inventory.events';
    await channel.assertExchange(exchange, 'topic', { durable: true });
    const { queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
    await channel.bindQueue(queue, exchange, 'product.created');

    const received = new Promise<Record<string, unknown>>((resolve) => {
      channel.consume(
        queue,
        (msg) => {
          if (msg) {
            resolve(JSON.parse(msg.content.toString()));
            channel.ack(msg);
          }
        },
        { noAck: false },
      );
    });

    const publishedCount = await relay.publishPending();
    expect(publishedCount).toBeGreaterThanOrEqual(1);

    const message = await received;
    expect(message.eventType).toBe('ProductCreated');
    expect(message.id).toBe(eventBefore.id);
    expect((message.payload as { productId: string }).productId).toBe(product.id);

    const eventAfter = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: eventBefore.id },
    });
    expect(eventAfter.publishedAt).not.toBeNull();

    await channel.close();
    await connection.close();
  });

  it('writes StockTransferred and StockTransferReceived events across the transfer lifecycle', async () => {
    const product = await as(adminAToken, 'post', '/api/v1/products')
      .send({ articleNumber: 'EVT-ART-6', name: 'Event Shoe 6' })
      .expect(201)
      .then((r) => r.body);
    const variant = await as(adminAToken, 'post', `/api/v1/products/${product.id}/variants`)
      .send({ size: '2', color: 'Y' })
      .expect(201)
      .then((r) => r.body);
    const sourceBranch = randomUUID();
    const destBranch = randomUUID();

    await as(adminAToken, 'post', '/api/v1/inventory/stock-in')
      .send({
        variantId: variant.id,
        branchId: sourceBranch,
        quantity: 10,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const transfer = await as(adminAToken, 'post', '/api/v1/transfers')
      .send({
        sourceBranchId: sourceBranch,
        destinationBranchId: destBranch,
        lines: [{ variantId: variant.id, requestedQty: 5 }],
      })
      .expect(201)
      .then((r) => r.body);
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/request`).send({}).expect(201);
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/approve`).send({}).expect(201);

    await prisma.outboxEvent.deleteMany();

    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/dispatch`).send({}).expect(201);
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/mark-in-transit`)
      .send({})
      .expect(201);
    await as(adminAToken, 'post', `/api/v1/transfers/${transfer.id}/receive`).send({}).expect(201);

    const events = await prisma.outboxEvent.findMany({
      where: {
        tenantId: tenantA,
        eventType: { in: ['StockTransferred', 'StockTransferReceived'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual(['StockTransferred', 'StockTransferReceived']);

    await prisma.inventoryReservation.deleteMany();
    await prisma.stockTransferLine.deleteMany();
    await prisma.stockTransfer.deleteMany();
  });
});
