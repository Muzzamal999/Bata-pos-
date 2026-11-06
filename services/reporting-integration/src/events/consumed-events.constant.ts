/** Event types this service consumes, and which exchange/routing key each comes from. */
export const CONSUMED_EVENTS = {
  PRODUCT_UPDATED: 'ProductUpdated',
  PRICE_UPDATED: 'PriceUpdated',
  STOCK_RECEIVED: 'StockReceived',
  STOCK_ADJUSTED: 'StockAdjusted',
  STOCK_TRANSFER_RECEIVED: 'StockTransferReceived',
  // Assumed contract - see sales-pos-events.contract.ts.
  SALE_COMPLETED: 'SaleCompleted',
  SALE_REFUNDED: 'SaleRefunded',
} as const;

export function toRoutingKey(eventType: string): string {
  return eventType.replace(/([a-z])([A-Z])/g, '$1.$2').toLowerCase();
}
