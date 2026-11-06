/**
 * Verified against Sales & POS (Service 3)'s actual SaleCompleted/
 * SaleRefunded emitters - this started as a documented guess before
 * Service 3 existed, and now matches its real payload shape field-for-field
 * (confirmed via a live cross-service checkout against the real broker).
 */

export interface SaleLinePayload {
  variantId: string;
  quantity: number;
  unitPrice: string;
}

export interface SaleCompletedPayload {
  saleId: string;
  branchId: string;
  cashierId?: string;
  totalAmount: string;
  currency?: string;
  paymentMethod?: string;
  lines?: SaleLinePayload[];
}

export interface SaleRefundedPayload {
  saleId: string;
  refundAmount?: string;
}
