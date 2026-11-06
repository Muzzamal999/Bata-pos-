/**
 * Real, verified payload shapes - copied directly from the Product &
 * Inventory service's own event-emitting code, not guessed.
 */

export interface ProductUpdatedPayload {
  productId: string;
  changes: Record<string, unknown>;
}

export interface PriceUpdatedPayload {
  priceId: string;
  productId: string | null;
  variantId: string | null;
  branchId: string | null;
  amount: string;
  currency: string;
}

export interface StockReceivedPayload {
  movementId: string;
  variantId: string;
  branchId: string;
  quantity: number;
  balanceAfter: number;
}

export interface StockAdjustedPayload {
  movementId: string;
  variantId: string;
  branchId: string;
  type: 'ADJUSTMENT' | 'DAMAGE';
  quantityDelta: number;
  balanceAfter: number;
}

export interface StockTransferReceivedPayload {
  transferId: string;
  referenceNumber: string;
  sourceBranchId: string;
  destinationBranchId: string;
  lines: { variantId: string; dispatchedQty: number | null; receivedQty: number | null }[];
}
