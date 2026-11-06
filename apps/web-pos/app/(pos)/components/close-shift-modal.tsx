'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import type { Shift } from '@bata-pos/shared-types';
import { salesPosApi } from '../../../lib/api';
import { Modal } from '../../../components/ui';
import styles from './close-shift-modal.module.css';

export function CloseShiftModal({
  shiftId,
  onClose,
  onSuccess,
}: {
  shiftId: string;
  onClose: () => void;
  onSuccess: (shift: Shift) => void;
}) {
  const [closingCash, setClosingCash] = useState('');
  const [confirming, setConfirming] = useState(false);

  const canSubmit = closingCash !== '' && Number(closingCash) >= 0;

  const close = useMutation({
    mutationFn: () => salesPosApi.closeShift(shiftId, { closingCash: Number(closingCash) }),
    onSuccess: (shift) => {
      onSuccess(shift);
      onClose();
    },
  });

  function handleSubmitClick() {
    if (!canSubmit) return;
    setConfirming(true);
  }

  function handleConfirm() {
    setConfirming(false);
    close.mutate();
  }

  return (
    <Modal title="Close Shift" onClose={onClose}>
      {close.isError && (
        <div className={styles.errorBanner} role="alert">
          {isAxiosError(close.error) && !close.error.response
            ? 'Cannot reach the Sales & POS service. Is it running?'
            : isAxiosError(close.error)
              ? String((close.error.response?.data as { message?: string | string[] } | undefined)?.message ?? 'Failed to close shift.')
              : (close.error as Error).message}
        </div>
      )}

      <p className={styles.warning}>
        Count the physical cash in the drawer and enter the total below. The expected amount and
        any discrepancy are calculated by the server once you confirm.
      </p>

      <div className={styles.field}>
        <label htmlFor="closing-cash" className={styles.fieldLabel}>
          Counted Cash
        </label>
        <input
          id="closing-cash"
          type="number"
          min={0}
          className={styles.fieldInput}
          placeholder="0.00"
          value={closingCash}
          onChange={(e) => setClosingCash(e.target.value)}
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
            <span className={styles.confirmText}>Close this shift? This cannot be undone.</span>
            <div className={styles.confirmButtons}>
              <button type="button" className={styles.confirmCancel} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmYes} onClick={handleConfirm}>
                Confirm Close
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
            disabled={!canSubmit || close.isPending}
            onClick={handleSubmitClick}
          >
            {close.isPending ? 'Closing…' : 'Close Shift'}
          </motion.button>
        )}
      </AnimatePresence>
    </Modal>
  );
}
