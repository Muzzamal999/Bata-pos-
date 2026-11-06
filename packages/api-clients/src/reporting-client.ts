import type {
  AuditLogEntry,
  AuditPage,
  AuditQueryParams,
  BestSellerRow,
  BranchComparisonRow,
  BranchSalesRow,
  CashierSalesRow,
  DashboardKpis,
  InventorySummaryRow,
  IntegrationStatus,
  PaymentSummaryRow,
  ProductPerformanceRow,
  ProfitAndLoss,
  ReportQueryParams,
  SalesReportQueryParams,
  SalesBucket,
  SalesSummary,
  SalesTrendPoint,
  StockMovementsPage,
} from '@bata-pos/shared-types';
import { createHttpClient, AuthHooks } from './http-client';

export class ReportingApi {
  private readonly client;

  constructor(baseURL: string, authHooks: AuthHooks) {
    this.client = createHttpClient(baseURL, authHooks);
  }

  // --- Reporting ---

  async salesReport(params: SalesReportQueryParams): Promise<SalesBucket[]> {
    const { data } = await this.client.get<SalesBucket[]>('/reports/sales', { params });
    return data;
  }

  async salesByBranch(params: ReportQueryParams): Promise<BranchSalesRow[]> {
    const { data } = await this.client.get<BranchSalesRow[]>('/reports/sales/by-branch', { params });
    return data;
  }

  async salesByCashier(params: ReportQueryParams): Promise<CashierSalesRow[]> {
    const { data } = await this.client.get<CashierSalesRow[]>('/reports/sales/by-cashier', {
      params,
    });
    return data;
  }

  async paymentSummary(params: ReportQueryParams): Promise<PaymentSummaryRow[]> {
    const { data } = await this.client.get<PaymentSummaryRow[]>('/reports/payments/summary', {
      params,
    });
    return data;
  }

  async stockMovements(
    params: ReportQueryParams & { page?: number; limit?: number },
  ): Promise<StockMovementsPage> {
    const { data } = await this.client.get<StockMovementsPage>('/reports/inventory/movements', {
      params,
    });
    return data;
  }

  async inventorySummary(params: ReportQueryParams): Promise<InventorySummaryRow[]> {
    const { data } = await this.client.get<InventorySummaryRow[]>('/reports/inventory/summary', {
      params,
    });
    return data;
  }

  async productPerformance(params: ReportQueryParams): Promise<ProductPerformanceRow[]> {
    const { data } = await this.client.get<ProductPerformanceRow[]>('/reports/products/performance', {
      params,
    });
    return data;
  }

  async profitAndLoss(): Promise<ProfitAndLoss> {
    const { data } = await this.client.get<ProfitAndLoss>('/reports/profit-loss');
    return data;
  }

  // --- Analytics ---

  async salesTrend(params: SalesReportQueryParams): Promise<SalesTrendPoint[]> {
    const { data } = await this.client.get<SalesTrendPoint[]>('/analytics/sales-trend', { params });
    return data;
  }

  async bestSellingProducts(
    params: ReportQueryParams & { limit?: number },
  ): Promise<BestSellerRow[]> {
    const { data } = await this.client.get<BestSellerRow[]>('/analytics/best-selling-products', {
      params,
    });
    return data;
  }

  async branchComparison(params: ReportQueryParams): Promise<BranchComparisonRow[]> {
    const { data } = await this.client.get<BranchComparisonRow[]>('/analytics/branch-comparison', {
      params,
    });
    return data;
  }

  async inventoryPerformance(params: ReportQueryParams): Promise<InventorySummaryRow[]> {
    const { data } = await this.client.get<InventorySummaryRow[]>(
      '/analytics/inventory-performance',
      { params },
    );
    return data;
  }

  async salesSummary(params: ReportQueryParams): Promise<SalesSummary> {
    const { data } = await this.client.get<SalesSummary>('/analytics/sales-summary', { params });
    return data;
  }

  async dashboardKpis(params: ReportQueryParams): Promise<DashboardKpis> {
    const { data } = await this.client.get<DashboardKpis>('/analytics/dashboard-kpis', { params });
    return data;
  }

  // --- Audit ---

  async listAuditLogs(params: AuditQueryParams): Promise<AuditPage> {
    const { data } = await this.client.get<AuditPage>('/audit', { params });
    return data;
  }

  async getAuditLog(id: string): Promise<AuditLogEntry> {
    const { data } = await this.client.get<AuditLogEntry>(`/audit/${id}`);
    return data;
  }

  // --- Integration ---

  async integrationStatus(): Promise<IntegrationStatus> {
    const { data } = await this.client.get<IntegrationStatus>('/integration/status');
    return data;
  }
}
