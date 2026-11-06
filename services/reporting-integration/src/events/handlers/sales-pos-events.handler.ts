import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withIdempotency } from '../idempotent-event.util';
import { EventEnvelope } from '../contracts/event-envelope.interface';
import { SaleCompletedPayload, SaleRefundedPayload } from '../contracts/sales-pos-events.contract';

/** Handlers for the ASSUMED Sales & POS contract - see sales-pos-events.contract.ts. */
@Injectable()
export class SalesPosEventsHandler {
  private readonly logger = new Logger(SalesPosEventsHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleSaleCompleted(event: EventEnvelope<SaleCompletedPayload>): Promise<boolean> {
    return withIdempotency(this.prisma, event.id, event.eventType, async (tx) => {
      await tx.saleRecord.create({
        data: {
          tenantId: event.tenantId,
          branchId: event.payload.branchId,
          saleId: event.payload.saleId,
          cashierId: event.payload.cashierId,
          totalAmount: event.payload.totalAmount,
          currency: event.payload.currency ?? 'PKR',
          paymentMethod: event.payload.paymentMethod,
          occurredAt: new Date(event.occurredAt),
        },
      });
      if (event.payload.lines?.length) {
        await tx.saleLineRecord.createMany({
          data: event.payload.lines.map((line) => ({
            tenantId: event.tenantId,
            branchId: event.payload.branchId,
            saleId: event.payload.saleId,
            variantId: line.variantId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            occurredAt: new Date(event.occurredAt),
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'sale.completed',
          entityType: 'Sale',
          entityId: event.payload.saleId,
          metadata: event.payload as object,
        },
      });
    });
  }

  async handleSaleRefunded(event: EventEnvelope<SaleRefundedPayload>): Promise<boolean> {
    return withIdempotency(this.prisma, event.id, event.eventType, async (tx) => {
      const existing = await tx.saleRecord.findUnique({
        where: { tenantId_saleId: { tenantId: event.tenantId, saleId: event.payload.saleId } },
      });
      if (!existing) {
        // The refund arrived before (or without) its matching SaleCompleted -
        // plausible given at-least-once, out-of-order delivery. Log it for
        // visibility rather than silently dropping it or crashing the consumer.
        this.logger.warn(
          `SaleRefunded for unknown saleId ${event.payload.saleId} (tenant ${event.tenantId})`,
        );
      } else {
        await tx.saleRecord.update({
          where: { id: existing.id },
          data: {
            status: 'REFUNDED',
            refundedAt: new Date(event.occurredAt),
            refundAmount: event.payload.refundAmount,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'sale.refunded',
          entityType: 'Sale',
          entityId: event.payload.saleId,
          metadata: event.payload as object,
        },
      });
    });
  }
}
