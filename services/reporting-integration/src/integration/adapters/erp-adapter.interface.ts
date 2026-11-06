export interface ErpSalesSummary {
  tenantId: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: string;
  saleCount: number;
}

export interface AdapterResult {
  success: boolean;
  reference: string;
  message?: string;
}

/**
 * No real ERP provider is integrated yet - this interface exists so the
 * reporting/analytics layer never has to know whether it's talking to a
 * real system or a mock. Implement a real adapter against this interface
 * once an actual ERP provider and its credentials are available.
 */
export interface ErpAdapter {
  pushSalesSummary(summary: ErpSalesSummary): Promise<AdapterResult>;
}

export const ERP_ADAPTER = Symbol('ERP_ADAPTER');
