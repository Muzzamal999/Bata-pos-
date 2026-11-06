import type {
  CashMovement,
  CatalogCacheEntry,
  CatalogLookupResult,
  CheckoutRequest,
  CloseShiftRequest,
  OpenShiftRequest,
  RecordCashMovementRequest,
  Refund,
  RefundRequest,
  Sale,
  Shift,
  VoidSaleRequest,
} from '@bata-pos/shared-types';
import { createHttpClient, AuthHooks } from './http-client';

export class SalesPosApi {
  private readonly client;

  constructor(baseURL: string, authHooks: AuthHooks) {
    this.client = createHttpClient(baseURL, authHooks);
  }

  // --- Sales ---

  async checkout(request: CheckoutRequest): Promise<Sale> {
    const { data } = await this.client.post<Sale>('/sales', request);
    return data;
  }

  async getSale(id: string): Promise<Sale> {
    const { data } = await this.client.get<Sale>(`/sales/${id}`);
    return data;
  }

  async refundSale(id: string, request: RefundRequest): Promise<Refund> {
    const { data } = await this.client.post<Refund>(`/sales/${id}/refund`, request);
    return data;
  }

  async voidSale(id: string, request: VoidSaleRequest): Promise<Refund> {
    const { data } = await this.client.post<Refund>(`/sales/${id}/void`, request);
    return data;
  }

  // --- Shifts ---

  async openShift(request: OpenShiftRequest): Promise<Shift> {
    const { data } = await this.client.post<Shift>('/shifts', request);
    return data;
  }

  async getCurrentShift(): Promise<Shift | null> {
    const { data } = await this.client.get<Shift | ''>('/shifts/current');
    return data || null;
  }

  async getShift(id: string): Promise<Shift> {
    const { data } = await this.client.get<Shift>(`/shifts/${id}`);
    return data;
  }

  async closeShift(id: string, request: CloseShiftRequest): Promise<Shift> {
    const { data } = await this.client.post<Shift>(`/shifts/${id}/close`, request);
    return data;
  }

  async recordCashMovement(id: string, request: RecordCashMovementRequest): Promise<CashMovement> {
    const { data } = await this.client.post<CashMovement>(`/shifts/${id}/cash-movements`, request);
    return data;
  }

  // --- Catalog ---

  async lookupByBarcode(barcode: string): Promise<CatalogLookupResult> {
    const { data } = await this.client.get<CatalogLookupResult>('/catalog/lookup', {
      params: { barcode },
    });
    return data;
  }

  async searchCatalog(query: string): Promise<CatalogCacheEntry[]> {
    const { data } = await this.client.get<CatalogCacheEntry[]>('/catalog/search', {
      params: { query },
    });
    return data;
  }

  async syncCatalog(): Promise<{ synced: number }> {
    const { data } = await this.client.post<{ synced: number }>('/catalog/sync');
    return data;
  }
}
