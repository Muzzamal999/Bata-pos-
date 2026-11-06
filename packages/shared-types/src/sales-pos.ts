/** Mirrors sales-pos's real Prisma models and DTOs (services/sales-pos/src/*). */

export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_WALLET' | 'OTHER';
export type SaleStatus = 'COMPLETED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED';

export interface SaleLine {
  id: string;
  saleId: string;
  variantId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: string;
  lineDiscount: string;
  lineTotal: string;
  refundedQuantity: number;
}

export interface SalePayment {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  createdAt: string;
}

export interface Sale {
  id: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
  shiftId: string | null;
  status: SaleStatus;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  totalAmount: string;
  currency: string;
  refundedAmount: string;
  refundedAt: string | null;
  idempotencyKey: string;
  lines: SaleLine[];
  payments: SalePayment[];
  /** Always embedded by the real GET /sales/:id response (loadOwnedSale includes it), never a separate round trip. */
  refunds: Refund[];
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutLineRequest {
  variantId: string;
  quantity: number;
  lineDiscount?: number;
}

export interface CheckoutPaymentRequest {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface CheckoutRequest {
  branchId: string;
  shiftId?: string;
  idempotencyKey: string;
  lines: CheckoutLineRequest[];
  payments: CheckoutPaymentRequest[];
  discountTotal?: number;
  taxTotal?: number;
}

export interface RefundRequest {
  idempotencyKey: string;
  lines: { saleLineId: string; quantity: number }[];
  reason?: string;
}

export interface VoidSaleRequest {
  idempotencyKey: string;
  reason?: string;
}

export interface Refund {
  id: string;
  saleId: string;
  tenantId: string;
  branchId: string;
  amount: string;
  reason: string | null;
  processedByUserId: string;
  idempotencyKey: string;
  shiftId: string | null;
  createdAt: string;
}

export type ShiftStatus = 'OPEN' | 'CLOSED';

export interface Shift {
  id: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
  openingFloat: string;
  closingCash: string | null;
  /**
   * Only ever computed and persisted by the backend at close time
   * (ShiftsService.close -> computeExpectedCash is private and never called
   * from any other path) - null for the whole life of an open shift. There
   * is no live "expected cash so far" read endpoint.
   */
  expectedCash: string | null;
  variance: string | null;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenShiftRequest {
  branchId: string;
  openingFloat: number;
}

export interface CloseShiftRequest {
  closingCash: number;
}

export type CashMovementType = 'CASH_IN' | 'CASH_OUT';

export interface CashMovement {
  id: string;
  shiftId: string;
  type: CashMovementType;
  amount: string;
  reason: string | null;
  createdAt: string;
}

export interface RecordCashMovementRequest {
  type: CashMovementType;
  amount: number;
  reason?: string;
}

export interface CatalogCacheEntry {
  id: string;
  tenantId: string;
  variantId: string;
  productId: string;
  productName: string;
  articleNumber: string | null;
  barcodes: string[];
  price: string | null;
  currency: string | null;
  lastSyncedAt: string;
}

export interface CatalogLookupResult {
  found: boolean;
  entry?: CatalogCacheEntry;
}
