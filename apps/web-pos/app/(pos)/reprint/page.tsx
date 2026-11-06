'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { Sale } from '@bata-pos/shared-types';
import { identityApi, salesPosApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { useCurrentUser } from '../../../lib/use-current-user';
import { Badge } from '../../../components/ui';
import { ReceiptModal } from '../components/receipt-modal';
import { ReturnModal } from '../components/return-modal';
import { VoidModal } from '../components/void-modal';
import styles from './reprint.module.css';

const STATUS_BADGE: Record<Sale['status'], { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  COMPLETED: { label: 'Completed', variant: 'success' },
  PARTIALLY_REFUNDED: { label: 'Partially Refunded', variant: 'warning' },
  REFUNDED: { label: 'Refunded', variant: 'danger' },
  VOIDED: { label: 'Voided', variant: 'danger' },
};

const EMPTY_PERMISSIONS: string[] = [];

function money(amount: string, currency: string): string {
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReprintPage() {
  const [saleId, setSaleId] = useState('');
  const [foundSale, setFoundSale] = useState<Sale | null>(null);
  const [activeAction, setActiveAction] = useState<'receipt' | 'return' | 'void' | null>(null);
  const { data: currentUser } = useCurrentUser();
  // Select the user object itself (a stable reference), not a derived array -
  // `?? []` on every call would hand useSyncExternalStore a fresh array
  // identity each render and trigger an infinite update loop.
  const authUser = useAuthStore((s) => s.user);
  const permissions = authUser?.permissions ?? EMPTY_PERMISSIONS;

  const lookup = useMutation({
    mutationFn: (id: string) => salesPosApi.getSale(id),
    onSuccess: (sale) => setFoundSale(sale),
  });

  const { data: branch } = useQuery({
    queryKey: ['branch', foundSale?.branchId],
    queryFn: () => identityApi.getBranch(foundSale!.branchId),
    enabled: Boolean(foundSale),
    retry: false,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = saleId.trim();
    if (!trimmed) return;
    setFoundSale(null);
    lookup.mutate(trimmed);
  }

  function refreshSale() {
    if (foundSale) lookup.mutate(foundSale.id);
  }

  const cashierName =
    foundSale && currentUser && foundSale.cashierId === currentUser.id
      ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
      : null;

  const hasReturnableLine = foundSale?.lines.some((l) => l.quantity - l.refundedQuantity > 0) ?? false;
  const canReturn =
    Boolean(foundSale) &&
    permissions.includes('sales.refund') &&
    (foundSale!.status === 'COMPLETED' || foundSale!.status === 'PARTIALLY_REFUNDED') &&
    hasReturnableLine;
  const canVoid = Boolean(foundSale) && permissions.includes('sales.void') && foundSale!.status === 'COMPLETED';

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Sale Lookup, Returns &amp; Receipts</h1>
      <p className={styles.subtitle}>
        Enter a sale ID (the Order # shown on the original receipt) to look it up, reprint it, or
        process a return or void.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          placeholder="e.g. 1cc12483-3676-47d0-b303-b67a3eb68cac"
          value={saleId}
          onChange={(e) => setSaleId(e.target.value)}
        />
        <button type="submit" className={styles.submitButton} disabled={!saleId.trim() || lookup.isPending}>
          {lookup.isPending ? 'Searching…' : 'Find Sale'}
        </button>
      </form>

      {lookup.isPending && <p className={styles.statusMessage}>Looking up sale…</p>}

      {lookup.isError && (
        <p className={styles.errorMessage}>
          {isAxiosError(lookup.error) && lookup.error.response?.status === 404
            ? "No sale found with that ID, or it isn't accessible from your branch."
            : isAxiosError(lookup.error) && lookup.error.response?.status === 403
              ? "Your account doesn't have permission to view sale receipts."
              : isAxiosError(lookup.error) && !lookup.error.response
                ? 'Cannot reach the Sales & POS service. Is it running?'
                : 'Failed to look up this sale.'}
        </p>
      )}

      {!foundSale && (
        <p className={styles.hint}>
          Only sales made at your own branch are accessible - this is enforced by the Sales &amp; POS
          service itself, not just hidden in this screen.
        </p>
      )}

      {foundSale && (
        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div className={styles.detailHeaderLeft}>
              <Badge variant={STATUS_BADGE[foundSale.status].variant}>{STATUS_BADGE[foundSale.status].label}</Badge>
              <span className={styles.detailAmount}>{money(foundSale.totalAmount, foundSale.currency)}</span>
            </div>
          </div>
          <div className={styles.detailMeta}>
            Order {foundSale.id} · {new Date(foundSale.createdAt).toLocaleString()}
          </div>

          <div className={styles.sectionTitle}>Items</div>
          {foundSale.lines.map((line) => (
            <div key={line.id} className={styles.detailLine}>
              <span>
                <span className={styles.detailLineName}>{line.productNameSnapshot}</span> × {line.quantity}
                {line.refundedQuantity > 0 && (
                  <span className={styles.refundedTag}>({line.refundedQuantity} returned)</span>
                )}
              </span>
              <span>{money(line.lineTotal, foundSale.currency)}</span>
            </div>
          ))}

          <div className={styles.sectionTitle}>Payments</div>
          {foundSale.payments.map((p) => (
            <div key={p.id} className={styles.detailLine}>
              <span>{p.method}</span>
              <span>{money(p.amount, foundSale.currency)}</span>
            </div>
          ))}

          {foundSale.refunds.length > 0 && (
            <>
              <div className={styles.sectionTitle}>Refund / Void History</div>
              {foundSale.refunds.map((r) => (
                <div key={r.id} className={styles.detailLine}>
                  <span>
                    {new Date(r.createdAt).toLocaleDateString()}
                    {r.reason ? ` — ${r.reason}` : ''}
                  </span>
                  <span>{money(r.amount, foundSale.currency)}</span>
                </div>
              ))}
            </>
          )}

          <div className={styles.actionRow}>
            <button type="button" className={styles.actionButton} onClick={() => setActiveAction('receipt')}>
              View Receipt
            </button>
            <button
              type="button"
              className={styles.actionButtonPrimary}
              disabled={!canReturn}
              onClick={() => setActiveAction('return')}
              title={!canReturn ? 'Not eligible for return (no remaining items, missing permission, or wrong status)' : undefined}
            >
              Process Return
            </button>
            <button
              type="button"
              className={styles.actionButtonDanger}
              disabled={!canVoid}
              onClick={() => setActiveAction('void')}
              title={!canVoid ? 'Only a completed sale with no prior refunds can be voided' : undefined}
            >
              Void Sale
            </button>
          </div>
          {!canReturn && !canVoid && (
            <p className={styles.ineligibleNote}>
              This sale is {STATUS_BADGE[foundSale.status].label.toLowerCase()} - no further returns or voids are
              possible.
            </p>
          )}
        </div>
      )}

      {foundSale && activeAction === 'receipt' && (
        <ReceiptModal
          sale={foundSale}
          branch={branch ?? null}
          cashierName={cashierName}
          onClose={() => setActiveAction(null)}
        />
      )}
      {foundSale && activeAction === 'return' && (
        <ReturnModal
          sale={foundSale}
          onClose={() => {
            setActiveAction(null);
            refreshSale();
          }}
          onSuccess={() => refreshSale()}
        />
      )}
      {foundSale && activeAction === 'void' && (
        <VoidModal
          sale={foundSale}
          onClose={() => {
            setActiveAction(null);
            refreshSale();
          }}
          onSuccess={() => refreshSale()}
        />
      )}
    </div>
  );
}
