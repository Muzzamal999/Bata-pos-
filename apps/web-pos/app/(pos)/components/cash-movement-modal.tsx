'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { CashMovement, CashMovementType } from '@bata-pos/shared-types';
import { salesPosApi } from '../../../lib/api';
import { Modal } from '../../../components/ui';
import styles from './cash-movement-modal.module.css';

export function CashMovementModal({
  shiftId,
  onClose,
  onSuccess,
}: {
  shiftId: string;
  onClose: () => void;
  onSuccess: (movement: CashMovement) => void;
}) {
  const [type, setType] = useState<CashMovementType>('CASH_IN');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const canSubmit = Number(amount) > 0 && reason.trim().length > 0;

  const record = useMutation({
    mutationFn: () => salesPosApi.recordCashMovement(shiftId, { type, amount: Number(amount), reason: reason.trim() }),
    onSuccess: (movement) => {
      onSuccess(movement);
      onClose();
    },
  });

  return (
    <Modal title="Record Cash Movement" onClose={onClose}>
      {record.isError && (
        <div className={styles.errorBanner} role="alert">
          {isAxiosError(record.error) && !record.error.response
            ? 'Cannot reach the Sales & POS service. Is it running?'
            : isAxiosError(record.error)
              ? String((record.error.response?.data as { message?: string | string[] } | undefined)?.message ?? 'Failed to record movement.')
              : (record.error as Error).message}
        </div>
      )}

      <div className={styles.typeToggle} role="radiogroup" aria-label="Movement type">
        <button
          type="button"
          role="radio"
          aria-checked={type === 'CASH_IN'}
          className={type === 'CASH_IN' ? styles.typeButtonActive : styles.typeButton}
          onClick={() => setType('CASH_IN')}
        >
          Cash In
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={type === 'CASH_OUT'}
          className={type === 'CASH_OUT' ? styles.typeButtonActive : styles.typeButton}
          onClick={() => setType('CASH_OUT')}
        >
          Cash Out
        </button>
      </div>

      <div className={styles.field}>
        <label htmlFor="movement-amount" className={styles.fieldLabel}>
          Amount
        </label>
        <input
          id="movement-amount"
          type="number"
          min={0}
          className={styles.fieldInput}
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="movement-reason" className={styles.fieldLabel}>
          Reason (required)
        </label>
        <textarea
          id="movement-reason"
          className={styles.fieldInput}
          placeholder={type === 'CASH_IN' ? 'e.g. Additional float top-up' : 'e.g. Bank drop, petty cash purchase'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <button
        type="button"
        className={styles.submitButton}
        disabled={!canSubmit || record.isPending}
        onClick={() => record.mutate()}
      >
        {record.isPending ? 'Recording…' : type === 'CASH_IN' ? 'Record Cash In' : 'Record Cash Out'}
      </button>
    </Modal>
  );
}
