/** Mirrors product-inventory's real Prisma models and DTOs (services/product-inventory/src/*). */

export interface Brand {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  articleNumber: string;
  name: string;
  description: string | null;
  brandId: string | null;
  categoryId: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Always embedded by the real backend (findAll/findOne both eager-load these) - never a separate round trip. */
  brand: Brand | null;
  category: Category | null;
  images: ProductImage[];
}

export interface CreateProductRequest {
  tenantId?: string;
  articleNumber: string;
  name: string;
  description?: string;
  brandId?: string;
  categoryId?: string;
  metadata?: Record<string, unknown>;
}

export interface Barcode {
  id: string;
  variantId: string;
  code: string;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  size: string;
  color: string;
  sku: string;
  isActive: boolean;
  barcodes: Barcode[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateVariantRequest {
  size: string;
  color: string;
  sku?: string;
}

export interface Price {
  id: string;
  tenantId: string;
  productId: string | null;
  variantId: string | null;
  branchId: string | null;
  amount: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePriceRequest {
  productId?: string;
  variantId?: string;
  branchId?: string;
  amount: number;
  currency?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface ResolvePriceParams {
  productId?: string;
  variantId?: string;
  branchId?: string;
  at?: string;
}

export type StockMovementType = 'STOCK_IN' | 'STOCK_OUT' | 'DAMAGE' | 'ADJUSTMENT';

export interface StockBalance {
  id: string;
  tenantId: string;
  locationId: string;
  variantId: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  lowStockThreshold: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  locationId: string;
  variantId: string;
  type: StockMovementType;
  quantityDelta: number;
  balanceAfter: number;
  reference: string | null;
  idempotencyKey: string;
  createdByUserId: string | null;
  createdAt: string;
}

export interface RecordMovementRequest {
  variantId: string;
  branchId: string;
  quantity: number;
  reference?: string;
  idempotencyKey: string;
}

export interface RecordAdjustmentRequest {
  variantId: string;
  branchId: string;
  quantityDelta: number;
  reference?: string;
  idempotencyKey: string;
}

export type StockInwardStatus = 'DRAFT' | 'CONFIRMED';

export interface StockInwardLine {
  id: string;
  receiptId: string;
  variantId: string;
  expectedQty: number;
  receivedQty: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockInwardReceipt {
  id: string;
  tenantId: string;
  branchId: string;
  referenceNumber: string;
  status: StockInwardStatus;
  supplierReference: string | null;
  createdByUserId: string | null;
  confirmedAt: string | null;
  lines: StockInwardLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateReceiptRequest {
  branchId: string;
  supplierReference?: string;
}

export interface AddReceiptLineRequest {
  variantId: string;
  expectedQty: number;
}

export interface ConfirmReceiptRequest {
  lines?: { lineId: string; receivedQty: number }[];
}

export type StockTransferStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'CANCELLED';

export interface StockTransferLine {
  id: string;
  transferId: string;
  variantId: string;
  requestedQty: number;
  dispatchedQty: number | null;
  receivedQty: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  referenceNumber: string;
  sourceBranchId: string;
  destinationBranchId: string;
  status: StockTransferStatus;
  notes: string | null;
  lines: StockTransferLine[];
  requestedAt: string | null;
  approvedAt: string | null;
  dispatchedAt: string | null;
  inTransitAt: string | null;
  receivedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferRequest {
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  lines: { variantId: string; requestedQty: number }[];
}
