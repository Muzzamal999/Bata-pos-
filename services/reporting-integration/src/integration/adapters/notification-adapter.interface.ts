import { AdapterResult } from './erp-adapter.interface';

export interface NotificationRequest {
  tenantId: string;
  recipient: string;
  subject: string;
  body: string;
}

/**
 * No real notification provider (email/SMS gateway) is integrated yet - see
 * erp-adapter.interface.ts for the same rationale. Implement a real adapter
 * against this interface once an actual provider and its credentials are
 * available.
 */
export interface NotificationAdapter {
  send(request: NotificationRequest): Promise<AdapterResult>;
}

export const NOTIFICATION_ADAPTER = Symbol('NOTIFICATION_ADAPTER');
