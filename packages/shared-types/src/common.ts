/** Mirrors common/dto/paginated-result.dto.ts, shared by all four backend services. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}
