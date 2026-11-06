import { AdapterResult } from './erp-adapter.interface';

export interface PaymentReconciliationRequest {
  tenantId: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
}

export interface PaymentReconciliationResult extends AdapterResult {
  matchedCount: number;
  unmatchedCount: number;
}

/**
 * No real payment gateway is integrated yet - see erp-adapter.interface.ts
 * for the same rationale. Implement a real adapter against this interface
 * once an actual payment provider and its credentials are available.
 */
export interface PaymentAdapter {
  reconcile(request: PaymentReconciliationRequest): Promise<PaymentReconciliationResult>;
}

export const PAYMENT_ADAPTER = Symbol('PAYMENT_ADAPTER');
