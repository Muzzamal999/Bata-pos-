'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import type { Refund, Sale } from '@bata-pos/shared-types';
import { salesPosApi } from '../../../lib/api';
import { Modal } from '../../../components/ui';
import styles from './void-modal.module.css';

function money(amount: string, currency: string): string {
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function VoidModal({ sale, onClose, onSuccess }: { sale: Sale; onClose: () => void; onSuccess: (result: Refund) => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [completed, setCompleted] = useState<Refund | null>(null);

  const canSubmit = reason.trim().length > 0;

  const voidSale = useMutation({
    mutationFn: () => salesPosApi.voidSale(sale.id, { idempotencyKey, reason: reason.trim() }),
    onSuccess: (result) => {
      setCompleted(result);
      onSuccess(result);
    },
  });

  function handleSubmitClick() {
    if (!canSubmit) return;
    setConfirming(true);
  }

  function handleConfirm() {
    setConfirming(false);
    voidSale.mutate();
  }

  if (completed) {
    return (
      <Modal title="Sale Voided" onClose={onClose}>
        <div className={styles.successPanel}>
          <div className={styles.successIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <div className={styles.successTitle}>Sale voided</div>
          <div className={styles.successMeta}>
            {money(completed.amount, sale.currency)} reversed · Stock restored
          </div>
          <button type="button" className={styles.doneButton} onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Void Sale" onClose={onClose}>
      {voidSale.isError && (
        <div className={styles.errorBanner} role="alert">
          {isAxiosError(voidSale.error) && !voidSale.error.response
            ? 'Cannot reach the Sales & POS service. Is it running?'
            : isAxiosError(voidSale.error)
              ? String((voidSale.error.response?.data as { message?: string | string[] } | undefined)?.message ?? 'Void failed.')
              : (voidSale.error as Error).message}
        </div>
      )}

      <div className={styles.summary}>
        <span className={styles.summaryLabel}>Sale total</span>
        <span className={styles.summaryAmount}>{money(sale.totalAmount, sale.currency)}</span>
      </div>

      <p className={styles.warning}>
        Voiding reverses this entire sale: all items are restocked and the full amount is reversed.
        This cannot be undone, and only applies to a sale with no prior refunds.
      </p>

      <div className={styles.field}>
        <label htmlFor="void-reason" className={styles.fieldLabel}>
          Void reason (required)
        </label>
        <textarea
          id="void-reason"
          className={styles.reasonInput}
          placeholder="e.g. Entered in error, duplicate transaction"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
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
              Permanently void this {money(sale.totalAmount, sale.currency)} sale?
            </span>
            <div className={styles.confirmButtons}>
              <button type="button" className={styles.confirmCancel} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmYes} onClick={handleConfirm}>
                Confirm Void
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
            disabled={!canSubmit || voidSale.isPending}
            onClick={handleSubmitClick}
          >
            {voidSale.isPending ? 'Processing…' : 'Void Sale'}
          </motion.button>
        )}
      </AnimatePresence>
    </Modal>
  );
}
