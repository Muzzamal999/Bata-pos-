import { HttpService } from '@nestjs/axios';
import { BadGatewayException, HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import { ResolvedPrice, StockMovementResult } from './dto/resolved-price.interface';

/**
 * Thin wrapper over Product & Inventory's REST API. Forwards the caller's
 * own bearer token rather than using a separate service credential - that
 * service verifies the same JWT this one does, so the caller's tenant/branch
 * access is enforced exactly as if they'd called it directly. This client
 * never reimplements pricing or stock-balance logic; it only calls the
 * endpoints that already enforce it.
 */
@Injectable()
export class ProductInventoryClientService {
  private readonly logger = new Logger(ProductInventoryClientService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('productInventory.baseUrl');
  }

  async resolvePrice(
    bearerToken: string,
    variantId: string,
    branchId: string,
  ): Promise<ResolvedPrice> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<ResolvedPrice>(`${this.baseUrl}/prices/resolve`, {
          params: { variantId, branchId },
          headers: { Authorization: `Bearer ${bearerToken}` },
        })
        .pipe(catchError((error: AxiosError) => this.handleError('resolvePrice', error))),
    );
    return data;
  }

  async stockOut(
    bearerToken: string,
    variantId: string,
    branchId: string,
    quantity: number,
    idempotencyKey: string,
    reference?: string,
  ): Promise<StockMovementResult> {
    const { data } = await firstValueFrom(
      this.httpService
        .post<StockMovementResult>(
          `${this.baseUrl}/inventory/stock-out`,
          { variantId, branchId, quantity, idempotencyKey, reference },
          { headers: { Authorization: `Bearer ${bearerToken}` } },
        )
        .pipe(catchError((error: AxiosError) => this.handleError('stockOut', error))),
    );
    return data;
  }

  async stockIn(
    bearerToken: string,
    variantId: string,
    branchId: string,
    quantity: number,
    idempotencyKey: string,
    reference?: string,
  ): Promise<StockMovementResult> {
    const { data } = await firstValueFrom(
      this.httpService
        .post<StockMovementResult>(
          `${this.baseUrl}/inventory/stock-in`,
          { variantId, branchId, quantity, idempotencyKey, reference },
          { headers: { Authorization: `Bearer ${bearerToken}` } },
        )
        .pipe(catchError((error: AxiosError) => this.handleError('stockIn', error))),
    );
    return data;
  }

  async listProducts(
    bearerToken: string,
    page: number,
    limit: number,
  ): Promise<{ data: { id: string; name: string; articleNumber: string }[]; total: number }> {
    const { data } = await firstValueFrom(
      this.httpService
        .get(`${this.baseUrl}/products`, {
          params: { page, limit },
          headers: { Authorization: `Bearer ${bearerToken}` },
        })
        .pipe(catchError((error: AxiosError) => this.handleError('listProducts', error))),
    );
    return data;
  }

  async listVariants(
    bearerToken: string,
    productId: string,
  ): Promise<{ id: string; barcodes: { code: string }[] }[]> {
    // This endpoint is paginated ({data, total, page, limit}), not a bare
    // array - request the max page size since catalog sync wants every
    // variant for this product, not just the first page.
    const { data } = await firstValueFrom(
      this.httpService
        .get<{ data: { id: string; barcodes: { code: string }[] }[] }>(
          `${this.baseUrl}/products/${productId}/variants`,
          {
            params: { limit: 100 },
            headers: { Authorization: `Bearer ${bearerToken}` },
          },
        )
        .pipe(catchError((error: AxiosError) => this.handleError('listVariants', error))),
    );
    return data.data;
  }

  private handleError(operation: string, error: AxiosError): never {
    this.logger.error(`Product & Inventory call failed (${operation}): ${error.message}`);
    if (error.response) {
      // Surface the real downstream error (e.g. 400 insufficient stock, 404
      // unknown variant) with its own status, rather than masking everything as a 502.
      const body = error.response.data as { message?: string | string[] } | undefined;
      throw new HttpException(body?.message ?? error.message, error.response.status);
    }
    throw new BadGatewayException('Product & Inventory service is unreachable');
  }
}
