'use client';

import type { Price, Product, ProductVariant, StockBalance } from '@bata-pos/shared-types';
import { Badge, Button, Modal } from '../../../components/ui';
import { resolveDisplayPrice } from '../../../lib/catalog';
import styles from './variant-picker-modal.module.css';

function money(amount: string): string {
  return `Rs. ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function VariantPickerModal({
  product,
  variants,
  prices,
  balances,
  branchId,
  isLoading,
  onSelect,
  onClose,
}: {
  product: Product;
  variants: ProductVariant[];
  prices: Price[];
  balances: StockBalance[];
  branchId: string | null;
  isLoading: boolean;
  onSelect: (variant: ProductVariant, price: Price) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={`${product.name} - Select Size & Colour`} onClose={onClose}>
      {isLoading && <p className={styles.statusMessage}>Loading variants…</p>}
      {!isLoading && variants.length === 0 && (
        <p className={styles.statusMessage}>This product has no variants configured yet.</p>
      )}

      {!isLoading && variants.length > 0 && (
        <div className={styles.list}>
          {variants.map((variant) => {
            const price = resolveDisplayPrice(prices, variant.id, branchId);
            const balance = balances.find((b) => b.variantId === variant.id);
            const stock = balance?.availableQty ?? 0;
            const disabled = stock <= 0 || !price || !variant.isActive;

            return (
              <div key={variant.id} className={`${styles.row} ${disabled ? styles.rowDisabled : ''}`}>
                <div className={styles.variantInfo}>
                  <span className={styles.variantLabel}>
                    Size {variant.size} · {variant.color}
                  </span>
                  <span className={styles.variantMeta}>
                    SKU {variant.sku}
                    {variant.barcodes.length > 0 && ` · ${variant.barcodes[0].code}`}
                  </span>
                  {!variant.isActive ? (
                    <Badge variant="neutral">Inactive</Badge>
                  ) : stock <= 0 ? (
                    <Badge variant="danger">Out of stock</Badge>
                  ) : (
                    <Badge variant="success">{stock} in stock</Badge>
                  )}
                </div>
                <div className={styles.variantRight}>
                  <span className={styles.price}>{price ? money(price.amount) : '—'}</span>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => price && onSelect(variant, price)}
                  >
                    Add
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
