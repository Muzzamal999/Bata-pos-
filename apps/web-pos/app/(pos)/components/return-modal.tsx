'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import type { Refund, Sale } from '@bata-pos/shared-types';
import { salesPosApi } from '../../../lib/api';
import { roundMoney } from '../../../lib/cart-store';
import { Modal } from '../../../components/ui';
import styles from './return-modal.module.css';

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReturnModal({ sale, onClose, onSuccess }: { sale: Sale; onClose: () => void; onSuccess: (refund: Refund) => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [completedRefund, setCompletedRefund] = useState<Refund | null>(null);

  const returnableLines = sale.lines.map((line) => ({
    line,
    remaining: line.quantity - line.refundedQuantity,
    qty: quantities[line.id] ?? 0,
  }));

  const refundAmount = roundMoney(
    returnableLines.reduce((sum, { line, qty }) => {
      const unitNet = Number(line.lineTotal) / line.quantity;
      return sum + unitNet * qty;
    }, 0),
  );

  const hasAnySelected = returnableLines.some(({ qty }) => qty > 0);
  const canSubmit = hasAnySelected && reason.trim().length > 0;

  const refund = useMutation({
    mutationFn: () =>
      salesPosApi.refundSale(sale.id, {
        idempotencyKey,
        lines: returnableLines
          .filter(({ qty }) => qty > 0)
          .map(({ line, qty }) => ({ saleLineId: line.id, quantity: qty })),
        reason: reason.trim(),
      }),
    onSuccess: (result) => {
      setCompletedRefund(result);
      onSuccess(result);
    },
  });

  function setQty(lineId: string, qty: number, max: number) {
    setQuantities((prev) => ({ ...prev, [lineId]: Math.max(0, Math.min(max, qty)) }));
  }

  function handleSubmitClick() {
    if (!canSubmit) return;
    setConfirming(true);
  }

  function handleConfirm() {
    setConfirming(false);
    refund.mutate();
  }

  if (completedRefund) {
    return (
      <Modal title="Return Processed" onClose={onClose}>
        <div className={styles.successPanel}>
          <div className={styles.successIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className={styles.successTitle}>Refund issued</div>
          <div className={styles.successMeta}>
            {money(Number(completedRefund.amount), sale.currency)} refunded · Refund #{completedRefund.id.slice(0, 8)}…
          </div>
          <button type="button" className={styles.doneButton} onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Process Return" onClose={onClose}>
      {refund.isError && (
        <div className={styles.errorBanner} role="alert">
          {isAxiosError(refund.error) && !refund.error.response
            ? 'Cannot reach the Sales & POS service. Is it running?'
            : isAxiosError(refund.error)
              ? String((refund.error.response?.data as { message?: string | string[] } | undefined)?.message ?? 'Return failed.')
              : (refund.error as Error).message}
        </div>
      )}

      <div className={styles.lineList}>
        {returnableLines.map(({ line, remaining, qty }) => (
          <div key={line.id} className={`${styles.line} ${remaining === 0 ? styles.lineDisabled : ''}`}>
            <div className={styles.lineInfo}>
              <div className={styles.lineName}>{line.productNameSnapshot}</div>
              <div className={styles.lineMeta}>
                {remaining === 0
                  ? 'Already fully returned'
                  : `${remaining} of ${line.quantity} returnable`}
              </div>
            </div>
            <div className={styles.qtyStepper}>
              <button
                type="button"
                className={styles.qtyButton}
                disabled={qty <= 0}
                aria-label={`Decrease return quantity for ${line.productNameSnapshot}`}
                onClick={() => setQty(line.id, qty - 1, remaining)}
              >
                −
              </button>
              <span className={styles.qtyValue}>{qty}</span>
              <button
                type="button"
                className={styles.qtyButton}
                disabled={qty >= remaining}
                aria-label={`Increase return quantity for ${line.productNameSnapshot}`}
                onClick={() => setQty(line.id, qty + 1, remaining)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.field}>
        <label htmlFor="return-reason" className={styles.fieldLabel}>
          Return reason (required)
        </label>
        <textarea
          id="return-reason"
          className={styles.reasonInput}
          placeholder="e.g. Wrong size, defective item, customer changed mind"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className={styles.amountRow}>
        <span className={styles.amountLabel}>Refund amount</span>
        <span className={styles.amountValue}>{money(refundAmount, sale.currency)}</span>
      </div>

      <AnimatePresence initial={false}>
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className={styles.confirmRow}
          >
            <span className={styles.confirmText}>
              Refund {money(refundAmount, sale.currency)} to the customer?
            </span>
            <div className={styles.confirmButtons}>
              <button type="button" className={styles.confirmCancel} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmYes} onClick={handleConfirm}>
                Confirm Refund
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="submit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            type="button"
            className={styles.submitButton}
            disabled={!canSubmit || refund.isPending}
            onClick={handleSubmitClick}
          >
            {refund.isPending ? 'Processing…' : 'Process Return'}
          </motion.button>
        )}
      </AnimatePresence>
    </Modal>
  );
}
