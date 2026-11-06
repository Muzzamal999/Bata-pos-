/** The transactional-outbox envelope shape, as actually published by Product & Inventory. */
export interface EventEnvelope<TPayload = Record<string, unknown>> {
  id: string;
  eventType: string;
  eventVersion: string;
  tenantId: string;
  payload: TPayload;
  occurredAt: string;
}
