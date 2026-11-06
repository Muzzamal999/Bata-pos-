import type {
  AddReceiptLineRequest,
  Barcode,
  Brand,
  Category,
  ConfirmReceiptRequest,
  CreatePriceRequest,
  CreateProductRequest,
  CreateReceiptRequest,
  CreateTransferRequest,
  CreateVariantRequest,
  PaginatedResult,
  PaginationParams,
  Price,
  Product,
  ProductVariant,
  RecordAdjustmentRequest,
  RecordMovementRequest,
  ResolvePriceParams,
  StockBalance,
  StockInwardLine,
  StockInwardReceipt,
  StockInwardStatus,
  StockMovement,
  StockTransfer,
} from '@bata-pos/shared-types';
import { createHttpClient, AuthHooks } from './http-client';

interface TenantScopedListParams extends PaginationParams {
  tenantId?: string;
}

export class ProductInventoryApi {
  private readonly client;

  constructor(baseURL: string, authHooks: AuthHooks) {
    this.client = createHttpClient(baseURL, authHooks);
  }

  // --- Brands & Categories ---

  async listBrands(params?: PaginationParams): Promise<PaginatedResult<Brand>> {
    const { data } = await this.client.get<PaginatedResult<Brand>>('/brands', { params });
    return data;
  }

  async createBrand(name: string): Promise<Brand> {
    const { data } = await this.client.post<Brand>('/brands', { name });
    return data;
  }

  async listCategories(params?: PaginationParams): Promise<PaginatedResult<Category>> {
    const { data } = await this.client.get<PaginatedResult<Category>>('/categories', { params });
    return data;
  }

  async createCategory(name: string): Promise<Category> {
    const { data } = await this.client.post<Category>('/categories', { name });
    return data;
  }

  // --- Products ---

  async listProducts(
    params?: TenantScopedListParams & {
      search?: string;
      brandId?: string;
      categoryId?: string;
      isActive?: boolean;
    },
  ): Promise<PaginatedResult<Product>> {
    const { data } = await this.client.get<PaginatedResult<Product>>('/products', { params });
    return data;
  }

  async getProduct(id: string): Promise<Product> {
    const { data } = await this.client.get<Product>(`/products/${id}`);
    return data;
  }

  async createProduct(request: CreateProductRequest): Promise<Product> {
    const { data } = await this.client.post<Product>('/products', request);
    return data;
  }

  async updateProduct(id: string, request: Partial<CreateProductRequest>): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}`, request);
    return data;
  }

  async activateProduct(id: string): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}/activate`);
    return data;
  }

  async deactivateProduct(id: string): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}/deactivate`);
    return data;
  }

  // --- Variants & barcodes ---

  async listVariants(
    productId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<ProductVariant>> {
    const { data } = await this.client.get<PaginatedResult<ProductVariant>>(
      `/products/${productId}/variants`,
      { params },
    );
    return data;
  }

  async getVariant(id: string): Promise<ProductVariant> {
    const { data } = await this.client.get<ProductVariant>(`/variants/${id}`);
    return data;
  }

  async createVariant(productId: string, request: CreateVariantRequest): Promise<ProductVariant> {
    const { data } = await this.client.post<ProductVariant>(
      `/products/${productId}/variants`,
      request,
    );
    return data;
  }

  async activateVariant(id: string): Promise<ProductVariant> {
    const { data } = await this.client.patch<ProductVariant>(`/variants/${id}/activate`);
    return data;
  }

  async deactivateVariant(id: string): Promise<ProductVariant> {
    const { data } = await this.client.patch<ProductVariant>(`/variants/${id}/deactivate`);
    return data;
  }

  async addBarcode(variantId: string, code: string): Promise<Barcode> {
    const { data } = await this.client.post<Barcode>(`/variants/${variantId}/barcodes`, { code });
    return data;
  }

  async removeBarcode(variantId: string, barcodeId: string): Promise<void> {
    await this.client.delete(`/variants/${variantId}/barcodes/${barcodeId}`);
  }

  // --- Pricing ---

  async listPrices(
    params?: PaginationParams & { tenantId?: string; productId?: string; variantId?: string; branchId?: string },
  ): Promise<PaginatedResult<Price>> {
    const { data } = await this.client.get<PaginatedResult<Price>>('/prices', { params });
    return data;
  }

  async resolvePrice(params: ResolvePriceParams): Promise<Price> {
    const { data } = await this.client.get<Price>('/prices/resolve', { params });
    return data;
  }

  async createPrice(request: CreatePriceRequest): Promise<Price> {
    const { data } = await this.client.post<Price>('/prices', request);
    return data;
  }

  async updatePrice(id: string, request: Partial<CreatePriceRequest>): Promise<Price> {
    const { data } = await this.client.patch<Price>(`/prices/${id}`, request);
    return data;
  }

  async getPriceHistory(id: string): Promise<Price[]> {
    const { data } = await this.client.get<Price[]>(`/prices/${id}/history`);
    return data;
  }

  // --- Inventory ---

  async stockIn(request: RecordMovementRequest): Promise<StockMovement> {
    const { data } = await this.client.post<StockMovement>('/inventory/stock-in', request);
    return data;
  }

  async stockOut(request: RecordMovementRequest): Promise<StockMovement> {
    const { data } = await this.client.post<StockMovement>('/inventory/stock-out', request);
    return data;
  }

  async markDamaged(request: RecordMovementRequest): Promise<StockMovement> {
    const { data } = await this.client.post<StockMovement>('/inventory/damage', request);
    return data;
  }

  async adjustStock(request: RecordAdjustmentRequest): Promise<StockMovement> {
    const { data } = await this.client.post<StockMovement>('/inventory/adjustments', request);
    return data;
  }

  async listBalances(
    params?: PaginationParams & { branchId?: string; variantId?: string; lowStockOnly?: boolean },
  ): Promise<PaginatedResult<StockBalance>> {
    const { data } = await this.client.get<PaginatedResult<StockBalance>>('/inventory/balances', {
      params,
    });
    return data;
  }

  async listLedger(
    params?: PaginationParams & { branchId?: string; variantId?: string },
  ): Promise<PaginatedResult<StockMovement>> {
    const { data } = await this.client.get<PaginatedResult<StockMovement>>('/inventory/ledger', {
      params,
    });
    return data;
  }

  async setLowStockThreshold(
    variantId: string,
    branchId: string,
    lowStockThreshold: number,
  ): Promise<StockBalance> {
    const { data } = await this.client.patch<StockBalance>('/inventory/thresholds', {
      variantId,
      branchId,
      lowStockThreshold,
    });
    return data;
  }

  // --- Stock inward (receiving) ---

  async createReceipt(request: CreateReceiptRequest): Promise<StockInwardReceipt> {
    const { data } = await this.client.post<StockInwardReceipt>('/stock-inward', request);
    return data;
  }

  async listReceipts(
    params?: PaginationParams & { branchId?: string; status?: StockInwardStatus },
  ): Promise<PaginatedResult<StockInwardReceipt>> {
    const { data } = await this.client.get<PaginatedResult<StockInwardReceipt>>('/stock-inward', {
      params,
    });
    return data;
  }

  async getReceipt(id: string): Promise<StockInwardReceipt> {
    const { data } = await this.client.get<StockInwardReceipt>(`/stock-inward/${id}`);
    return data;
  }

  /** Returns the created line only - the backend does not return the whole receipt here. */
  async addReceiptLine(receiptId: string, request: AddReceiptLineRequest): Promise<StockInwardLine> {
    const { data } = await this.client.post<StockInwardLine>(
      `/stock-inward/${receiptId}/lines`,
      request,
    );
    return data;
  }

  async confirmReceipt(receiptId: string, request?: ConfirmReceiptRequest): Promise<StockInwardReceipt> {
    const { data } = await this.client.post<StockInwardReceipt>(
      `/stock-inward/${receiptId}/confirm`,
      request,
    );
    return data;
  }

  // --- Transfers ---

  async createTransfer(request: CreateTransferRequest): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>('/transfers', request);
    return data;
  }

  async listTransfers(
    params?: PaginationParams & { branchId?: string },
  ): Promise<PaginatedResult<StockTransfer>> {
    const { data } = await this.client.get<PaginatedResult<StockTransfer>>('/transfers', { params });
    return data;
  }

  async getTransfer(id: string): Promise<StockTransfer> {
    const { data } = await this.client.get<StockTransfer>(`/transfers/${id}`);
    return data;
  }

  async requestTransfer(id: string): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>(`/transfers/${id}/request`);
    return data;
  }

  async approveTransfer(id: string): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>(`/transfers/${id}/approve`);
    return data;
  }

  async rejectTransfer(id: string): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>(`/transfers/${id}/reject`);
    return data;
  }

  async cancelTransfer(id: string): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>(`/transfers/${id}/cancel`);
    return data;
  }

  async dispatchTransfer(id: string): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>(`/transfers/${id}/dispatch`);
    return data;
  }

  async markTransferInTransit(id: string): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>(`/transfers/${id}/mark-in-transit`);
    return data;
  }

  async receiveTransfer(id: string): Promise<StockTransfer> {
    const { data } = await this.client.post<StockTransfer>(`/transfers/${id}/receive`);
    return data;
  }
}
