import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { CatalogService } from '../catalog/catalog.service';

interface EventEnvelope<TPayload = Record<string, unknown>> {
  id: string;
  eventType: string;
  tenantId: string;
  payload: TPayload;
}

interface ProductUpdatedPayload {
  productId: string;
}

interface PriceUpdatedPayload {
  variantId: string | null;
  amount: string;
  currency: string;
}

const QUEUE_NAME = 'sales_pos.catalog_sync';

/**
 * Keeps the local catalog cache reasonably fresh by consuming Product &
 * Inventory's real ProductUpdated/PriceUpdated events. This cache is
 * explicitly non-authoritative (checkout always re-resolves price and stock
 * live), so failures here are logged and acked rather than retried/dead-
 * lettered with the rigor Service 4's consumer uses - a missed cache update
 * just means a slightly stale search/scan result until the next sync.
 */
@Injectable()
export class CatalogSyncConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CatalogSyncConsumerService.name);
  private connection: amqp.ChannelModel | undefined;
  private channel: amqp.Channel | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly catalogService: CatalogService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<boolean>('rabbitmq.consumerEnabled') ?? true;
    if (!enabled) {
      this.logger.log('Catalog sync consumer disabled by config (test mode)');
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
    const exchange = this.configService.getOrThrow<string>('rabbitmq.productInventoryExchange');

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(exchange, 'topic', { durable: true });
    await this.channel.assertQueue(QUEUE_NAME, { durable: true });
    await this.channel.bindQueue(QUEUE_NAME, exchange, 'product.updated');
    await this.channel.bindQueue(QUEUE_NAME, exchange, 'price.updated');

    await this.channel.consume(QUEUE_NAME, (msg) => this.handleMessage(msg), { noAck: false });
    this.logger.log(`Consuming from queue "${QUEUE_NAME}" for catalog freshness`);
  }

  private async handleMessage(msg: amqp.ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) {
      return;
    }
    try {
      const event = JSON.parse(msg.content.toString()) as EventEnvelope;
      if (event.eventType === 'ProductUpdated') {
        await this.handleProductUpdated(event as unknown as EventEnvelope<ProductUpdatedPayload>);
      } else if (event.eventType === 'PriceUpdated') {
        await this.handlePriceUpdated(event as unknown as EventEnvelope<PriceUpdatedPayload>);
      }
      this.channel.ack(msg);
    } catch (error) {
      this.logger.error(
        `Catalog sync consumer failed to process message: ${(error as Error).message}`,
      );
      this.channel.ack(msg);
    }
  }

  private async handleProductUpdated(event: EventEnvelope<ProductUpdatedPayload>): Promise<void> {
    // The payload carries no auth token and no variant list - re-fetch this
    // one product's variants via a service-level call using... there is no
    // service credential in this flow, so we can only refresh what the
    // periodic/manual sync already populated. Re-syncing a single product
    // on this event would require a bearer token we don't have here; this
    // is a known limitation of event-driven cache refresh without a
    // service-to-service credential, left to the periodic manual sync.
    this.logger.debug(
      `ProductUpdated received for ${event.payload.productId} - awaiting next sync`,
    );
  }

  private async handlePriceUpdated(event: EventEnvelope<PriceUpdatedPayload>): Promise<void> {
    if (!event.payload.variantId) {
      return;
    }
    await this.catalogService.updatePriceFromEvent(
      event.tenantId,
      event.payload.variantId,
      event.payload.amount,
      event.payload.currency,
    );
  }
}
