import { Injectable, Logger } from '@nestjs/common';
import { CONSUMED_EVENTS } from './consumed-events.constant';
import { EventEnvelope } from './contracts/event-envelope.interface';
import {
  PriceUpdatedPayload,
  ProductUpdatedPayload,
  StockAdjustedPayload,
  StockReceivedPayload,
  StockTransferReceivedPayload,
} from './contracts/product-inventory-events.contract';
import { SaleCompletedPayload, SaleRefundedPayload } from './contracts/sales-pos-events.contract';
import { ProductInventoryEventsHandler } from './handlers/product-inventory-events.handler';
import { SalesPosEventsHandler } from './handlers/sales-pos-events.handler';

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);

  constructor(
    private readonly productInventoryHandler: ProductInventoryEventsHandler,
    private readonly salesHandler: SalesPosEventsHandler,
  ) {}

  /**
   * Payloads arrive off the wire as untyped JSON - the per-event-type casts
   * below assert the contracts documented in ./contracts, they are not
   * re-validated here. A malformed payload surfaces as a thrown error inside
   * the handler's own Prisma write, which the consumer's retry/dead-letter
   * path already handles.
   */
  async dispatch(event: EventEnvelope): Promise<boolean> {
    switch (event.eventType) {
      case CONSUMED_EVENTS.PRODUCT_UPDATED:
        return this.productInventoryHandler.handleProductUpdated(
          event as unknown as EventEnvelope<ProductUpdatedPayload>,
        );
      case CONSUMED_EVENTS.PRICE_UPDATED:
        return this.productInventoryHandler.handlePriceUpdated(
          event as unknown as EventEnvelope<PriceUpdatedPayload>,
        );
      case CONSUMED_EVENTS.STOCK_RECEIVED:
        return this.productInventoryHandler.handleStockReceived(
          event as unknown as EventEnvelope<StockReceivedPayload>,
        );
      case CONSUMED_EVENTS.STOCK_ADJUSTED:
        return this.productInventoryHandler.handleStockAdjusted(
          event as unknown as EventEnvelope<StockAdjustedPayload>,
        );
      case CONSUMED_EVENTS.STOCK_TRANSFER_RECEIVED:
        return this.productInventoryHandler.handleStockTransferReceived(
          event as unknown as EventEnvelope<StockTransferReceivedPayload>,
        );
      case CONSUMED_EVENTS.SALE_COMPLETED:
        return this.salesHandler.handleSaleCompleted(
          event as unknown as EventEnvelope<SaleCompletedPayload>,
        );
      case CONSUMED_EVENTS.SALE_REFUNDED:
        return this.salesHandler.handleSaleRefunded(
          event as unknown as EventEnvelope<SaleRefundedPayload>,
        );
      default:
        this.logger.warn(`No handler registered for event type "${event.eventType}", ignoring`);
        return true;
    }
  }
}
