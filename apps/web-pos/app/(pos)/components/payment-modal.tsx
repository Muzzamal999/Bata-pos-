'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import type { PaymentMethod, Sale } from '@bata-pos/shared-types';
import { identityApi, salesPosApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { roundMoney, type CartLine } from '../../../lib/cart-store';
import { Modal } from '../../../components/ui';
import { ReceiptModal } from './receipt-modal';
import type { LineDetail } from './receipt';
import styles from './payment-modal.module.css';

interface SplitPaymentLine {
  method: PaymentMethod;
  amount: number;
}

const METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  {
    value: 'CASH',
    label: 'Cash',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    value: 'CARD',
    label: 'Card',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    value: 'MOBILE_WALLET',
    label: 'Mobile Wallet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
];

function money(amount: number): string {
  return `Rs. ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PaymentModal({
  lines,
  discountTotal,
  total,
  onClose,
  onSuccess,
}: {
  lines: CartLine[];
  discountTotal: number;
  total: number;
  onClose: () => void;
  onSuccess: (saleId: string) => void;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitLines, setSplitLines] = useState<SplitPaymentLine[]>([]);
  const [splitAmount, setSplitAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedChange, setCompletedChange] = useState(0);
  const [completedCashReceived, setCompletedCashReceived] = useState<number | undefined>(undefined);
  const [showReceipt, setShowReceipt] = useState(false);

  const branchId = useAuthStore.getState().selectedBranchId;
  const currentUser = useAuthStore.getState().user;
  const { data: branch } = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => identityApi.getBranch(branchId!),
    enabled: Boolean(branchId) && Boolean(completedSale),
    retry: false,
  });

  const lineDetails: Record<string, LineDetail> = Object.fromEntries(
    lines.map((l) => [l.variantId, { sku: l.sku, size: l.size, color: l.color }]),
  );

  const splitPaid = roundMoney(splitLines.reduce((sum, p) => sum + p.amount, 0));
  const remaining = roundMoney(total - splitPaid);
  const receivedNum = Number(cashReceived) || 0;
  const changeDue = selectedMethod === 'CASH' ? roundMoney(Math.max(0, receivedNum - remaining)) : 0;
  const insufficientCash = selectedMethod === 'CASH' && cashReceived !== '' && receivedNum < remaining;

  const checkout = useMutation({
    mutationFn: (payments: SplitPaymentLine[]) => {
      const branchId = useAuthStore.getState().selectedBranchId;
      if (!branchId) throw new Error('No branch selected for this session.');
      return salesPosApi.checkout({
        branchId,
        idempotencyKey,
        lines: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          ...(l.lineDiscount > 0 ? { lineDiscount: l.lineDiscount } : {}),
        })),
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        discountTotal,
      });
    },
    onSuccess: (sale) => {
      const isCash = selectedMethod === 'CASH' && !splitMode;
      setCompletedSale(sale);
      setCompletedChange(isCash ? changeDue : 0);
      setCompletedCashReceived(isCash ? receivedNum : undefined);
      onSuccess(sale.id);
    },
  });

  function buildFinalPayments(): SplitPaymentLine[] {
    if (splitMode) return splitLines;
    return [{ method: selectedMethod, amount: remaining }];
  }

  function handleAddSplitLine() {
    const amount = Number(splitAmount);
    if (!amount || amount <= 0 || amount > remaining) return;
    setSplitLines((prev) => [...prev, { method: selectedMethod, amount: roundMoney(amount) }]);
    setSplitAmount('');
  }

  function removeSplitLine(index: number) {
    setSplitLines((prev) => prev.filter((_, i) => i !== index));
  }

  const canConfirm = splitMode
    ? remaining <= 0 && splitLines.length > 0
    : selectedMethod !== 'CASH' || (cashReceived !== '' && !insufficientCash);

  function handleCompleteClick() {
    if (!canConfirm) return;
    setConfirming(true);
  }

  function handleConfirmPayment() {
    setConfirming(false);
    checkout.mutate(buildFinalPayments());
  }

  if (completedSale) {
    if (showReceipt) {
      return (
        <ReceiptModal
          sale={completedSale}
          branch={branch ?? null}
          cashierName={currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : null}
          lineDetails={lineDetails}
          cashReceived={completedCashReceived}
          onClose={() => setShowReceipt(false)}
        />
      );
    }
    return (
      <Modal title="Payment Successful" onClose={onClose}>
        <div className={styles.successPanel}>
          <div className={styles.successIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className={styles.successTitle}>Sale completed</div>
          <div className={styles.successMeta}>Order #{completedSale.id.slice(0, 8)}…</div>
          {completedChange > 0 && (
            <div className={styles.successChange}>Change due: {money(completedChange)}</div>
          )}
          <button type="button" className={styles.viewReceiptButton} onClick={() => setShowReceipt(true)}>
            View Receipt
          </button>
          <button type="button" className={styles.newSaleButton} onClick={onClose}>
            New Sale
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Payment" onClose={onClose}>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total Amount</span>
        <span className={styles.totalAmount}>{money(total)}</span>
      </div>

      {checkout.isError && (
        <div className={styles.errorBanner} role="alert">
          {isAxiosError(checkout.error) && !checkout.error.response
            ? 'Cannot reach the Sales & POS service. Is it running?'
            : isAxiosError(checkout.error)
              ? String(
                  (checkout.error.response?.data as { message?: string | string[] } | undefined)?.message ??
                    'Payment failed.',
                )
              : (checkout.error as Error).message}
        </div>
      )}

      <div className={styles.methodList} role="radiogroup" aria-label="Payment method">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={selectedMethod === m.value}
            className={`${styles.methodRow} ${selectedMethod === m.value ? styles.methodRowActive : ''}`}
            onClick={() => setSelectedMethod(m.value)}
          >
            <span className={styles.methodIcon}>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {!splitMode && selectedMethod === 'CASH' && (
        <>
          <div className={styles.field}>
            <label htmlFor="cash-received" className={styles.fieldLabel}>
              Cash Received
            </label>
            <input
              id="cash-received"
              type="number"
              min={0}
              className={styles.fieldInput}
              placeholder="0.00"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
          </div>
          {insufficientCash && (
            <p className={styles.insufficientWarning}>
              Insufficient payment - still need {money(roundMoney(remaining - receivedNum))}.
            </p>
          )}
          {!insufficientCash && cashReceived !== '' && (
            <div className={styles.changeRow}>
              <span>Change due</span>
              <span className={styles.changeAmount}>{money(changeDue)}</span>
            </div>
          )}
        </>
      )}

      {!splitMode && (
        <button type="button" className={styles.splitToggle} onClick={() => setSplitMode(true)}>
          Split across multiple payment methods?
        </button>
      )}

      {splitMode && (
        <>
          {splitLines.length > 0 && (
            <div className={styles.splitList}>
              {splitLines.map((line, i) => (
                <div key={i} className={styles.splitLine}>
                  <span>
                    {METHODS.find((m) => m.value === line.method)?.label} — {money(line.amount)}
                  </span>
                  <button type="button" className={styles.splitLineRemove} onClick={() => removeSplitLine(i)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className={styles.remainingRow}>
            <span>Remaining</span>
            <span>{money(remaining)}</span>
          </div>
          <div className={styles.addPaymentRow}>
            <input
              type="number"
              min={0}
              max={remaining}
              className={styles.fieldInput}
              placeholder={`Up to ${remaining.toFixed(2)}`}
              value={splitAmount}
              onChange={(e) => setSplitAmount(e.target.value)}
            />
            <button
              type="button"
              className={styles.addPaymentButton}
              disabled={!Number(splitAmount) || Number(splitAmount) <= 0 || Number(splitAmount) > remaining}
              onClick={handleAddSplitLine}
            >
              Add {METHODS.find((m) => m.value === selectedMethod)?.label}
            </button>
          </div>
        </>
      )}

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
              Confirm payment of {money(total)}
              {!splitMode ? ` via ${METHODS.find((m) => m.value === selectedMethod)?.label}` : ''}?
            </span>
            <div className={styles.confirmButtons}>
              <button type="button" className={styles.confirmCancel} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmYes} onClick={handleConfirmPayment}>
                Confirm
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            whileHover={{ scale: canConfirm && !checkout.isPending ? 1.01 : 1 }}
            whileTap={{ scale: canConfirm && !checkout.isPending ? 0.98 : 1 }}
            type="button"
            className={styles.completeButton}
            disabled={!canConfirm || checkout.isPending}
            onClick={handleCompleteClick}
          >
            {checkout.isPending ? 'Processing…' : 'Complete Payment'}
          </motion.button>
        )}
      </AnimatePresence>
    </Modal>
  );
}
