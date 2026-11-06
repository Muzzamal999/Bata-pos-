import { useQueries, useQuery } from '@tanstack/react-query';
import type { Price, ProductVariant } from '@bata-pos/shared-types';
import { productInventoryApi } from './api';

export const PRODUCTS_PAGE_SIZE = 12;

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => productInventoryApi.listCategories({ limit: 100 }),
    staleTime: 60_000,
  });
}

export function useProducts(params: { search: string; categoryId: string | null; page: number }) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () =>
      productInventoryApi.listProducts({
        search: params.search || undefined,
        categoryId: params.categoryId ?? undefined,
        isActive: true,
        page: params.page,
        limit: PRODUCTS_PAGE_SIZE,
      }),
  });
}

/** One query per product, scoped to the current page only - there is no bulk "variants for these products" endpoint. */
export function useVariantsForProducts(productIds: string[]) {
  const results = useQueries({
    queries: productIds.map((productId) => ({
      queryKey: ['variants', productId],
      queryFn: () => productInventoryApi.listVariants(productId, { limit: 50 }),
      staleTime: 30_000,
    })),
  });

  const byProductId = new Map<string, ProductVariant[]>();
  productIds.forEach((id, i) => {
    byProductId.set(id, results[i]?.data?.data ?? []);
  });

  return {
    byProductId,
    isLoading: results.some((r) => r.isLoading),
  };
}

/**
 * All current prices for the tenant in one call, matched client-side by
 * variantId (preferring a branch-specific row). This is a *display*
 * convenience only - the real source of truth for money is
 * /prices/resolve, used at checkout time, not here.
 */
export function usePricesBulk() {
  return useQuery({
    queryKey: ['prices-bulk'],
    queryFn: () => productInventoryApi.listPrices({ limit: 100 }),
    staleTime: 30_000,
  });
}

export function resolveDisplayPrice(prices: Price[], variantId: string, branchId: string | null): Price | null {
  const forVariant = prices.filter((p) => p.variantId === variantId);
  const branchMatch = branchId ? forVariant.find((p) => p.branchId === branchId) : undefined;
  return branchMatch ?? forVariant.find((p) => p.branchId === null) ?? forVariant[0] ?? null;
}

export function useBranchBalances(branchId: string | null) {
  return useQuery({
    queryKey: ['balances', branchId],
    queryFn: () => productInventoryApi.listBalances({ branchId: branchId!, limit: 100 }),
    enabled: Boolean(branchId),
    staleTime: 15_000,
  });
}
