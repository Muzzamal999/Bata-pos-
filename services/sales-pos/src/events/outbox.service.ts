import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DomainEventType } from './domain-events.constant';

export interface OutboxEnqueueParams {
  tenantId: string;
  eventType: DomainEventType;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxService {
  /**
   * Writes the event row using the SAME transaction client as the business
   * change it describes - pass the `tx` from inside a `$transaction`
   * callback. This is what makes the event "transactional": it either
   * commits together with the business change, or not at all.
   */
  async enqueue(tx: Prisma.TransactionClient, params: OutboxEnqueueParams): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        tenantId: params.tenantId,
        eventType: params.eventType,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
  }
}
