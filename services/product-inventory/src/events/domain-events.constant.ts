/** The fixed catalog of domain events this service publishes. */
export const DOMAIN_EVENTS = {
  PRODUCT_CREATED: 'ProductCreated',
  PRODUCT_UPDATED: 'ProductUpdated',
  PRICE_UPDATED: 'PriceUpdated',
  STOCK_RECEIVED: 'StockReceived',
  STOCK_ADJUSTED: 'StockAdjusted',
  STOCK_TRANSFERRED: 'StockTransferred',
  STOCK_TRANSFER_RECEIVED: 'StockTransferReceived',
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
