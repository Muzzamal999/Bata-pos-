import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from './rabbitmq.service';

const BATCH_SIZE = 50;

function toRoutingKey(eventType: string): string {
  return eventType.replace(/([a-z])([A-Z])/g, '$1.$2').toLowerCase();
}

@Injectable()
export class OutboxRelayService implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelayService.name);
  private enabled = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMq: RabbitMqService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.enabled = this.configService.get<boolean>('rabbitmq.outboxRelayEnabled') ?? true;
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async relayOnSchedule(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    await this.publishPending();
  }

  /**
   * Publishes every unpublished event, oldest first. Each publish is
   * confirmed by the broker before the row is marked published, so a crash
   * mid-batch just leaves the remaining rows to be retried next tick -
   * nothing is ever marked published without a confirmed delivery.
   */
  async publishPending(): Promise<number> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    let publishedCount = 0;
    for (const event of pending) {
      try {
        await this.rabbitMq.publish(toRoutingKey(event.eventType), {
          id: event.id,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          tenantId: event.tenantId,
          payload: event.payload,
          occurredAt: event.createdAt,
        });
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
        publishedCount += 1;
      } catch (error) {
        this.logger.error(`Failed to publish outbox event ${event.id}, will retry`, error as Error);
      }
    }
    return publishedCount;
  }
}
