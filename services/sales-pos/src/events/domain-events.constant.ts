/**
 * This service's own published event catalog. Field names match the
 * placeholder contract reporting-integration already built against
 * (SaleCompletedPayload/SaleRefundedPayload), so that service starts
 * consuming real events with zero changes on its side.
 */
export const DOMAIN_EVENTS = {
  SALE_COMPLETED: 'SaleCompleted',
  SALE_REFUNDED: 'SaleRefunded',
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
