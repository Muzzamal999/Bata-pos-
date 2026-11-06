import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from './event-dispatcher.service';
import { EventEnvelope } from './contracts/event-envelope.interface';
import { toRoutingKey, CONSUMED_EVENTS } from './consumed-events.constant';

const QUEUE_NAME = 'reporting.events';
const MAX_RETRIES = 3;
const RETRY_HEADER = 'x-retry-count';

@Injectable()
export class RabbitMqConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumerService.name);
  private connection: amqp.ChannelModel | undefined;
  private channel: amqp.Channel | undefined;
  private enabled = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatcher: EventDispatcherService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.enabled = this.configService.get<boolean>('rabbitmq.consumerEnabled') ?? true;
    if (!this.enabled) {
      this.logger.log('Event consumer disabled by config (test mode)');
      return;
    }
    await this.connectAndConsume();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async connectAndConsume(): Promise<void> {
    const url = this.configService.getOrThrow<string>('rabbitmq.url');
    const productInventoryExchange = this.configService.getOrThrow<string>(
      'rabbitmq.productInventoryExchange',
    );
    const salesPosExchange = this.configService.getOrThrow<string>('rabbitmq.salesPosExchange');

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    // One unacked delivery at a time: this consumer retries a failed
    // message by requeuing it (same queue, incremented retry header), and
    // without a prefetch limit the broker could pipeline several in-flight
    // redeliveries of the SAME logical message concurrently - a real,
    // observed race where a later round's ack/requeue could still be
    // in-flight when an earlier round's completion let a test (or caller)
    // tear the channel down. Serializing to one at a time removes that
    // window entirely.
    await this.channel.prefetch(1);

    await this.channel.assertExchange(productInventoryExchange, 'topic', { durable: true });
    await this.channel.assertExchange(salesPosExchange, 'topic', { durable: true });

    await this.channel.assertQueue(QUEUE_NAME, { durable: true });

    const productInventoryRoutingKeys = [
      CONSUMED_EVENTS.PRODUCT_UPDATED,
      CONSUMED_EVENTS.PRICE_UPDATED,
      CONSUMED_EVENTS.STOCK_RECEIVED,
      CONSUMED_EVENTS.STOCK_ADJUSTED,
      CONSUMED_EVENTS.STOCK_TRANSFER_RECEIVED,
    ].map(toRoutingKey);
    for (const routingKey of productInventoryRoutingKeys) {
      await this.channel.bindQueue(QUEUE_NAME, productInventoryExchange, routingKey);
    }

    const salesRoutingKeys = [CONSUMED_EVENTS.SALE_COMPLETED, CONSUMED_EVENTS.SALE_REFUNDED].map(
      toRoutingKey,
    );
    for (const routingKey of salesRoutingKeys) {
      await this.channel.bindQueue(QUEUE_NAME, salesPosExchange, routingKey);
    }

    await this.channel.consume(QUEUE_NAME, (msg) => this.handleMessage(msg), { noAck: false });

    this.logger.log(`Consuming from queue "${QUEUE_NAME}", bound to both exchanges`);
  }

  private async handleMessage(msg: amqp.ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) {
      return;
    }

    const retryCount = (msg.properties.headers?.[RETRY_HEADER] as number | undefined) ?? 0;

    try {
      const event = JSON.parse(msg.content.toString()) as EventEnvelope;
      await this.dispatcher.dispatch(event);
      this.channel.ack(msg);
    } catch (error) {
      await this.retryOrDeadLetter(msg, retryCount, error as Error);
    }
  }

  private async retryOrDeadLetter(
    msg: amqp.ConsumeMessage,
    retryCount: number,
    error: Error,
  ): Promise<void> {
    if (!this.channel) {
      return;
    }

    if (retryCount < MAX_RETRIES) {
      this.logger.warn(
        `Processing failed (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying: ${error.message}`,
      );
      this.channel.sendToQueue(QUEUE_NAME, msg.content, {
        persistent: true,
        headers: { [RETRY_HEADER]: retryCount + 1 },
      });
      this.channel.ack(msg);
      return;
    }

    this.logger.error(`Exhausted retries, dead-lettering event: ${error.message}`, error.stack);
    let eventType = 'unknown';
    let payload: unknown = msg.content.toString();
    try {
      const parsed = JSON.parse(msg.content.toString());
      eventType = parsed.eventType ?? 'unknown';
      payload = parsed;
    } catch {
      // content wasn't even valid JSON - keep the raw string as payload.
    }

    await this.prisma.deadLetterEvent.create({
      data: {
        eventType,
        payload: payload as Prisma.InputJsonValue,
        error: error.message,
        retryCount,
      },
    });
    this.channel.ack(msg);
  }
}
