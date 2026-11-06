import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withIdempotency } from '../idempotent-event.util';
import { EventEnvelope } from '../contracts/event-envelope.interface';
import {
  PriceUpdatedPayload,
  ProductUpdatedPayload,
  StockAdjustedPayload,
  StockReceivedPayload,
  StockTransferReceivedPayload,
} from '../contracts/product-inventory-events.contract';

@Injectable()
export class ProductInventoryEventsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async handleProductUpdated(event: EventEnvelope<ProductUpdatedPayload>): Promise<boolean> {
    return withIdempotency(this.prisma, event.id, event.eventType, async (tx) => {
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'product.updated',
          entityType: 'Product',
          entityId: event.payload.productId,
          metadata: event.payload as object,
        },
      });
    });
  }

  async handlePriceUpdated(event: EventEnvelope<PriceUpdatedPayload>): Promise<boolean> {
    return withIdempotency(this.prisma, event.id, event.eventType, async (tx) => {
      await tx.priceChangeRecord.create({
        data: {
          tenantId: event.tenantId,
          productId: event.payload.productId,
          variantId: event.payload.variantId,
          branchId: event.payload.branchId,
          amount: event.payload.amount,
          currency: event.payload.currency,
          occurredAt: new Date(event.occurredAt),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'price.updated',
          entityType: 'Price',
          entityId: event.payload.priceId,
          metadata: event.payload as object,
        },
      });
    });
  }

  async handleStockReceived(event: EventEnvelope<StockReceivedPayload>): Promise<boolean> {
    return withIdempotency(this.prisma, event.id, event.eventType, async (tx) => {
      await tx.stockMovementRecord.create({
        data: {
          tenantId: event.tenantId,
          branchId: event.payload.branchId,
          variantId: event.payload.variantId,
          eventType: event.eventType,
          quantity: event.payload.quantity,
          balanceAfter: event.payload.balanceAfter,
          occurredAt: new Date(event.occurredAt),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'inventory.stock_received',
          entityType: 'StockMovement',
          entityId: event.payload.movementId,
          metadata: event.payload as object,
        },
      });
    });
  }

  async handleStockAdjusted(event: EventEnvelope<StockAdjustedPayload>): Promise<boolean> {
    return withIdempotency(this.prisma, event.id, event.eventType, async (tx) => {
      await tx.stockMovementRecord.create({
        data: {
          tenantId: event.tenantId,
          branchId: event.payload.branchId,
          variantId: event.payload.variantId,
          eventType: event.eventType,
          quantity: event.payload.quantityDelta,
          balanceAfter: event.payload.balanceAfter,
          occurredAt: new Date(event.occurredAt),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'inventory.stock_adjusted',
          entityType: 'StockMovement',
          entityId: event.payload.movementId,
          metadata: event.payload as object,
        },
      });
    });
  }

  async handleStockTransferReceived(
    event: EventEnvelope<StockTransferReceivedPayload>,
  ): Promise<boolean> {
    return withIdempotency(this.prisma, event.id, event.eventType, async (tx) => {
      for (const line of event.payload.lines) {
        await tx.stockMovementRecord.create({
          data: {
            tenantId: event.tenantId,
            branchId: event.payload.destinationBranchId,
            variantId: line.variantId,
            eventType: event.eventType,
            quantity: line.receivedQty ?? 0,
            occurredAt: new Date(event.occurredAt),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'inventory.stock_transfer_received',
          entityType: 'StockTransfer',
          entityId: event.payload.transferId,
          metadata: event.payload as object,
        },
      });
    });
  }
}
