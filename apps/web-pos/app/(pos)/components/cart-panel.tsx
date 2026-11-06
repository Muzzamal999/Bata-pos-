'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../../../lib/auth-store';
import {
  cartDiscountAmount,
  cartGrandTotal,
  cartLineDiscounts,
  cartSubtotal,
  lineSubtotal,
  lineTotal,
  useCartStore,
} from '../../../lib/cart-store';
import { PaymentModal } from './payment-modal';
import { ShoePlaceholderIcon } from './shoe-placeholder-icon';
import styles from './cart-panel.module.css';

function money(amount: number): string {
  return `Rs. ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CartPanel() {
  const {
    lines,
    discountMode,
    discountValue,
    hasHydrated,
    incrementQty,
    decrementQty,
    removeItem,
    setLineDiscount,
    setDiscountMode,
    setDiscountValue,
    clear,
  } = useCartStore();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const canApplyDiscount = useAuthStore((s) => s.user?.permissions.includes('sales.create') ?? false);

  const subtotal = cartSubtotal(lines);
  const lineDiscountsTotal = cartLineDiscounts(lines);
  const cartDiscount = canApplyDiscount ? cartDiscountAmount(lines, discountMode, discountValue) : 0;
  const total = canApplyDiscount ? cartGrandTotal(lines, discountMode, discountValue) : subtotal - lineDiscountsTotal;

  function handleClearCart() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    clear();
    setConfirmingClear(false);
  }

  if (!hasHydrated) {
    return <div className={styles.panel} />;
  }

  return (
    <div className={styles.panel}>
      <p className={styles.title}>Current Sale ({lines.length})</p>

      {lines.length === 0 ? (
        <div className={styles.emptyState}>Scan or select a product to start a sale.</div>
      ) : (
        <div className={styles.lines}>
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.div
                key={line.variantId}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 48 }}
                transition={{ duration: 0.18 }}
                className={styles.line}
              >
                <span className={styles.lineThumb}>
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote product photos are not on an allow-listed domain for next/image
                    <img src={line.imageUrl} alt={line.productName} />
                  ) : (
                    <ShoePlaceholderIcon />
                  )}
                </span>
                <div className={styles.lineBody}>
                  <div className={styles.lineName}>{line.productName}</div>
                  <div className={styles.lineSubtitle}>
                    SKU {line.sku} · Size: {line.size} | {line.color}
                  </div>
                  <div className={styles.lineFooter}>
                    <div className={styles.stepper}>
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        type="button"
                        className={styles.stepperButton}
                        aria-label={`Decrease quantity of ${line.productName}`}
                        onClick={() => decrementQty(line.variantId)}
                      >
                        −
                      </motion.button>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={line.quantity}
                          initial={{ scale: 1.25, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={styles.qty}
                        >
                          {line.quantity}
                        </motion.span>
                      </AnimatePresence>
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        type="button"
                        className={styles.stepperButton}
                        aria-label={`Increase quantity of ${line.productName}`}
                        disabled={line.quantity >= line.availableQty}
                        title={line.quantity >= line.availableQty ? 'No more stock available at this branch' : undefined}
                        onClick={() => incrementQty(line.variantId)}
                      >
                        +
                      </motion.button>
                    </div>
                    <span className={styles.linePrice}>{money(lineTotal(line))}</span>
                  </div>
                  {canApplyDiscount && (
                    <div className={styles.lineDiscountRow}>
                      <label htmlFor={`line-discount-${line.variantId}`}>Item discount</label>
                      <input
                        id={`line-discount-${line.variantId}`}
                        type="number"
                        min={0}
                        max={lineSubtotal(line)}
                        className={styles.lineDiscountInput}
                        value={line.lineDiscount || ''}
                        placeholder="0.00"
                        onChange={(e) => setLineDiscount(line.variantId, Number(e.target.value) || 0)}
                      />
                    </div>
                  )}
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  type="button"
                  className={styles.removeButton}
                  aria-label={`Remove ${line.productName}`}
                  onClick={() => removeItem(line.variantId)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </div>

        {lineDiscountsTotal > 0 && (
          <div className={`${styles.summaryRow} ${styles.discountRow}`}>
            <span>Item discounts</span>
            <span>-{money(lineDiscountsTotal)}</span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {canApplyDiscount && (
            <motion.div
              key="discount-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div className={styles.discountModeRow}>
                <span>Discount</span>
                <div className={styles.discountModeToggle} role="group" aria-label="Discount type">
                  <button
                    type="button"
                    className={discountMode === 'fixed' ? styles.discountModeActive : styles.discountModeButton}
                    onClick={() => setDiscountMode('fixed')}
                  >
                    Rs.
                  </button>
                  <button
                    type="button"
                    className={discountMode === 'percentage' ? styles.discountModeActive : styles.discountModeButton}
                    onClick={() => setDiscountMode('percentage')}
                  >
                    %
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  max={discountMode === 'percentage' ? 100 : undefined}
                  className={styles.discountInput}
                  value={discountValue || ''}
                  placeholder="0.00"
                  onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                />
              </div>
              {cartDiscount > 0 && (
                <div className={`${styles.summaryRow} ${styles.discountRow}`}>
                  <span>Cart discount</span>
                  <span>-{money(cartDiscount)}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.totalRow}>
          <span>Total</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={total}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
            >
              {money(total)}
            </motion.span>
          </AnimatePresence>
        </div>

        <motion.button
          whileHover={{ scale: lines.length === 0 ? 1 : 1.01 }}
          whileTap={{ scale: lines.length === 0 ? 1 : 0.98 }}
          type="button"
          className={styles.completeButton}
          disabled={lines.length === 0}
          onClick={() => setShowPayment(true)}
        >
          Complete Sale
        </motion.button>

        {confirmingClear ? (
          <div className={styles.clearConfirmRow}>
            <span>Clear all {lines.length} items?</span>
            <button type="button" className={styles.clearConfirmCancel} onClick={() => setConfirmingClear(false)}>
              Keep
            </button>
            <button type="button" className={styles.clearConfirmYes} onClick={handleClearCart}>
              Clear
            </button>
          </div>
        ) : (
          <button type="button" className={styles.clearButton} disabled={lines.length === 0} onClick={handleClearCart}>
            Clear Cart
          </button>
        )}
      </div>

      {showPayment && (
        <PaymentModal
          lines={lines}
          discountTotal={cartDiscount}
          total={total}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            clear();
          }}
        />
      )}
    </div>
  );
}
