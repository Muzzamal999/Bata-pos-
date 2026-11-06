'use client';

import { useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import type { Product, ProductVariant } from '@bata-pos/shared-types';
import { salesPosApi, productInventoryApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { useCartStore } from '../../../lib/cart-store';
import {
  useBranchBalances,
  useCategories,
  usePricesBulk,
  useProducts,
  useVariantsForProducts,
  resolveDisplayPrice,
} from '../../../lib/catalog';
import { ShoePlaceholderIcon } from './shoe-placeholder-icon';
import { VariantPickerModal } from './variant-picker-modal';
import styles from './product-grid.module.css';

const CATEGORY_PILLS = ['All', 'Men', 'Women', 'Kids', 'Accessories'];
const BARCODE_PATTERN = /^\d{6,}$/;
const SCAN_DEBOUNCE_MS = 800;

function productImageUrl(product: Product): string | null {
  return product.images[0]?.url ?? null;
}

export function ProductGrid() {
  const [query, setQuery] = useState('');
  const [activePill, setActivePill] = useState('All');
  const [page, setPage] = useState(1);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [scanMessage, setScanMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  const branchId = useAuthStore((s) => s.selectedBranchId);
  const addItem = useCartStore((s) => s.addItem);

  const { data: categories } = useCategories();
  const activeCategoryId = useMemo(() => {
    if (activePill === 'All') return null;
    return categories?.data.find((c) => c.name.toLowerCase() === activePill.toLowerCase())?.id ?? null;
  }, [categories, activePill]);

  const { data: productsResult, isLoading, error } = useProducts({ search: query, categoryId: activeCategoryId, page });
  const products = productsResult?.data ?? [];
  const totalPages = productsResult ? Math.max(1, Math.ceil(productsResult.total / productsResult.limit)) : 1;

  const { byProductId: variantsByProduct, isLoading: variantsLoading } = useVariantsForProducts(
    products.map((p) => p.id),
  );
  const { data: pricesResult } = usePricesBulk();
  const prices = pricesResult?.data ?? [];
  const { data: balancesResult } = useBranchBalances(branchId);
  const balances = balancesResult?.data ?? [];

  function showScanMessage(type: 'error' | 'success', text: string) {
    setScanMessage({ type, text });
    setTimeout(() => setScanMessage((current) => (current?.text === text ? null : current)), 3000);
  }

  function addVariantToCart(productName: string, variant: ProductVariant, amount: string, imageUrl: string | null = null) {
    const balance = balances.find((b) => b.variantId === variant.id);
    const availableQty = balance?.availableQty ?? 0;
    if (availableQty <= 0) {
      showScanMessage('error', `${productName} (Size ${variant.size}, ${variant.color}) is out of stock at this branch.`);
      return;
    }
    const added = addItem({
      variantId: variant.id,
      productName,
      sku: variant.sku,
      imageUrl,
      size: variant.size,
      color: variant.color,
      unitPrice: Number(amount),
      availableQty,
    });
    if (added) {
      showScanMessage('success', `Added ${productName} (Size ${variant.size}, ${variant.color}).`);
    } else {
      showScanMessage('error', `Only ${availableQty} in stock for ${productName} (Size ${variant.size}, ${variant.color}).`);
    }
  }

  function handleCardClick(product: Product) {
    const variants = (variantsByProduct.get(product.id) ?? []).filter((v) => v.isActive);
    if (variants.length === 0) {
      showScanMessage('error', `${product.name} has no active variants to sell.`);
      return;
    }
    if (variants.length === 1) {
      const price = resolveDisplayPrice(prices, variants[0].id, branchId);
      if (!price) {
        showScanMessage('error', `No price is set for ${product.name} yet.`);
        return;
      }
      addVariantToCart(product.name, variants[0], price.amount, productImageUrl(product));
      return;
    }
    setPickerProduct(product);
  }

  async function handleBarcodeScan(code: string) {
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.code === code && now - lastScanRef.current.at < SCAN_DEBOUNCE_MS) {
      return; // Same code re-fired within the debounce window - treat as one physical scan, not two.
    }
    lastScanRef.current = { code, at: now };

    try {
      const result = await salesPosApi.lookupByBarcode(code);
      if (!result.found || !result.entry) {
        showScanMessage('error', `Unknown barcode: ${code}`);
        return;
      }
      const variant = await productInventoryApi.getVariant(result.entry.variantId);
      const price = resolveDisplayPrice(prices, variant.id, branchId) ?? (result.entry.price
        ? { amount: result.entry.price, currency: result.entry.currency ?? 'PKR' }
        : null);
      if (!price) {
        showScanMessage('error', `No price is set for ${result.entry.productName} yet.`);
        return;
      }
      addVariantToCart(result.entry.productName, variant, price.amount);
    } catch (err) {
      if (isAxiosError(err) && !err.response) {
        showScanMessage('error', 'Cannot reach the catalog service to look up this barcode.');
      } else {
        showScanMessage('error', `Could not look up barcode: ${code}`);
      }
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return; // Preserve all other normal keyboard navigation untouched.
    const value = query.trim();
    if (!value) return;
    if (BARCODE_PATTERN.test(value)) {
      void handleBarcodeScan(value);
      setQuery('');
    }
    // A non-barcode-shaped Enter is a no-op beyond the live text search already running as-you-type.
  }

  return (
    <div className={styles.panel}>
      <div className={styles.searchWrapper}>
        <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          className={styles.searchInput}
          placeholder="Search products or scan barcode…"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      {scanMessage && (
        <div className={scanMessage.type === 'error' ? styles.scanError : styles.scanSuccess} role={scanMessage.type === 'error' ? 'alert' : 'status'}>
          {scanMessage.text}
        </div>
      )}

      <div className={styles.pills} role="tablist" aria-label="Category">
        {CATEGORY_PILLS.map((pill) => (
          <button
            key={pill}
            type="button"
            role="tab"
            aria-selected={activePill === pill}
            className={`${styles.pill} ${activePill === pill ? styles.pillActive : ''}`}
            onClick={() => {
              setActivePill(pill);
              setPage(1);
            }}
          >
            {pill}
          </button>
        ))}
      </div>

      {isLoading && <p className={styles.statusMessage}>Loading products…</p>}
      {error && (
        <p className={styles.statusMessage}>
          {isAxiosError(error) && !error.response
            ? 'Cannot reach the Product & Inventory service. Is it running?'
            : 'Failed to load products.'}
        </p>
      )}
      {!isLoading && !error && products.length === 0 && (
        <p className={styles.statusMessage}>No products match. Try a different search or category.</p>
      )}

      {!isLoading && !error && products.length > 0 && (
        <div className={styles.grid}>
          {products.map((product) => {
            const variants = variantsByProduct.get(product.id) ?? [];
            const activeVariants = variants.filter((v) => v.isActive);
            const totalStock = activeVariants.reduce(
              (sum, v) => sum + (balances.find((b) => b.variantId === v.id)?.availableQty ?? 0),
              0,
            );
            const displayPrices = activeVariants
              .map((v) => resolveDisplayPrice(prices, v.id, branchId))
              .filter((p): p is NonNullable<typeof p> => Boolean(p));
            const minPrice = displayPrices.length
              ? Math.min(...displayPrices.map((p) => Number(p.amount)))
              : null;
            const maxPrice = displayPrices.length
              ? Math.max(...displayPrices.map((p) => Number(p.amount)))
              : null;
            const imageUrl = productImageUrl(product);
            const outOfStock = !variantsLoading && activeVariants.length > 0 && totalStock <= 0;

            return (
              <button
                key={product.id}
                type="button"
                className={styles.card}
                onClick={() => handleCardClick(product)}
                disabled={activeVariants.length === 0}
              >
                <span className={styles.cardImage}>
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote product photos are not on an allow-listed domain for next/image
                    <img src={imageUrl} alt={product.name} />
                  ) : (
                    <ShoePlaceholderIcon />
                  )}
                  {outOfStock && <span className={styles.outOfStockBadge}>Out of stock</span>}
                </span>
                <span className={styles.cardName}>{product.name}</span>
                <span className={styles.cardMeta}>
                  {product.articleNumber}
                  {product.category ? ` · ${product.category.name}` : ''}
                </span>
                <span className={styles.cardPrice}>
                  {minPrice === null
                    ? '—'
                    : minPrice === maxPrice
                      ? `Rs. ${minPrice.toLocaleString()}`
                      : `Rs. ${minPrice.toLocaleString()}–${maxPrice!.toLocaleString()}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && !error && productsResult && productsResult.total > productsResult.limit && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageButton}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className={styles.pageLabel}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageButton}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {pickerProduct && (
        <VariantPickerModal
          product={pickerProduct}
          variants={variantsByProduct.get(pickerProduct.id) ?? []}
          prices={prices}
          balances={balances}
          branchId={branchId}
          isLoading={variantsLoading}
          onSelect={(variant, price) => {
            addVariantToCart(pickerProduct.name, variant, price.amount, productImageUrl(pickerProduct));
            setPickerProduct(null);
          }}
          onClose={() => setPickerProduct(null)}
        />
      )}
    </div>
  );
}
