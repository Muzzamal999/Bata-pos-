/** Mirrors reporting-integration's real response shapes (services/reporting-integration/src/*). */

export interface ReportQueryParams {
  tenantId?: string;
  branchId?: string;
  from?: string;
  to?: string;
}

export interface SalesReportQueryParams extends ReportQueryParams {
  period?: 'daily' | 'weekly' | 'monthly';
}

export interface SalesBucket {
  period: string;
  saleCount: number;
  grossAmount: string;
  refundedAmount: string;
  netAmount: string;
}

export interface BranchSalesRow {
  branchId: string;
  saleCount: number;
  grossAmount: string;
  refundedAmount: string;
  netAmount: string;
}

export interface CashierSalesRow {
  cashierId: string | null;
  saleCount: number;
  grossAmount: string;
}

export interface PaymentSummaryRow {
  paymentMethod: string | null;
  saleCount: number;
  grossAmount: string;
}

export interface StockMovementRecord {
  id: string;
  tenantId: string;
  branchId: string;
  variantId: string;
  eventType: string;
  quantity: number;
  balanceAfter: number | null;
  occurredAt: string;
}

/** Note: this service's own paginated shape uses `items`, not the `data` field the other three services use. */
export interface StockMovementsPage {
  items: StockMovementRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface InventorySummaryRow {
  variantId: string;
  branchId: string;
  netQuantity: number;
  movementCount: number;
}

export interface ProductPerformanceRow {
  variantId: string;
  priceChangeCount: number;
  latestAmount: string | null;
  netStockQuantity: number;
  movementCount: number;
}

export interface ProfitAndLoss {
  available: boolean;
  reason?: string;
}

export interface SalesTrendPoint extends SalesBucket {
  changePercent: string | null;
}

export interface BestSellerRow {
  variantId: string;
  totalQuantity: number;
  totalRevenue: string;
}

export interface BranchComparisonRow extends BranchSalesRow {
  inventoryMovementCount: number;
  inventoryNetQuantity: number;
}

export interface SalesSummary {
  totalSales: number;
  totalGross: string;
  totalRefunded: string;
  totalNet: string;
  branchCount: number;
  cashierCount: number;
}

export interface DashboardKpis extends SalesSummary {
  topProducts: BestSellerRow[];
  outOfStockVariantCount: number;
  trackedVariantCount: number;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditQueryParams {
  tenantId?: string;
  entityType?: string;
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface IntegrationStatus {
  erp: { mode: string; configured: boolean };
  payment: { mode: string; configured: boolean };
  notification: { mode: string; configured: boolean };
  note: string;
}
