import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqp.ChannelModel | undefined;
  private channel: amqp.ConfirmChannel | undefined;
  private readonly exchange: string;

  constructor(private readonly configService: ConfigService) {
    this.exchange = this.configService.getOrThrow<string>('rabbitmq.exchange');
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const url = this.configService.getOrThrow<string>('rabbitmq.url');
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });

    this.connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
      this.channel = undefined;
      this.connection = undefined;
    });

    this.logger.log(`Connected to RabbitMQ, exchange "${this.exchange}" ready`);
  }

  /** Publishes with a broker-confirmed delivery. Resolves only once RabbitMQ has acknowledged the message. */
  async publish(routingKey: string, message: Record<string, unknown>): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }
    const channel = this.channel;
    if (!channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const content = Buffer.from(JSON.stringify(message));

    await new Promise<void>((resolve, reject) => {
      channel.publish(this.exchange, routingKey, content, { persistent: true }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
