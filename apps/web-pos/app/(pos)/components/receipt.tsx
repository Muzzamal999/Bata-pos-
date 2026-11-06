'use client';

import type { Branch, PaymentMethod, Sale } from '@bata-pos/shared-types';
import styles from './receipt.module.css';

export type ReceiptLayout = 'a4' | '80mm' | '58mm';

export interface LineDetail {
  sku: string;
  size: string;
  color: string;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE_WALLET: 'Mobile Wallet',
  OTHER: 'Other',
};

function money(amount: string | number, currency: string): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LAYOUT_CLASS: Record<ReceiptLayout, string> = {
  a4: styles.receiptA4,
  '80mm': styles.receipt80mm,
  '58mm': styles.receipt58mm,
};

export function Receipt({
  sale,
  branch,
  cashierName,
  lineDetails,
  cashReceived,
  layout,
}: {
  sale: Sale;
  branch: Branch | null;
  cashierName: string | null;
  /**
   * Size/colour/SKU are never persisted on SaleLine (confirmed against the
   * real schema - only productNameSnapshot is stored), so this enrichment is
   * only available for a receipt shown right after a fresh checkout, from
   * the cart that produced it. A reprinted historical sale omits these
   * fields rather than inventing them.
   */
  lineDetails?: Record<string, LineDetail>;
  cashReceived?: number;
  layout: ReceiptLayout;
}) {
  const cashPayment = sale.payments.find((p) => p.method === 'CASH');
  const change = cashPayment && cashReceived ? Math.max(0, cashReceived - Number(cashPayment.amount)) : null;

  return (
    <div className={`${styles.receipt} ${LAYOUT_CLASS[layout]}`}>
      <div className={styles.header}>
        <span className={styles.wordmark}>Bata</span>
        <div className={styles.title}>Payment Receipt</div>
      </div>

      {branch && (
        <div className={styles.storeInfo}>
          <div>{branch.name}</div>
          <div>
            Branch #{branch.code}
            {branch.address ? ` · ${branch.address}` : ''}
          </div>
        </div>
      )}

      <div className={styles.metaRow}>
        <span>Receipt #{sale.id.slice(0, 8)}</span>
        <span>{formatDateTime(sale.createdAt)}</span>
      </div>
      <div className={styles.metaRow}>
        <span>Order ID</span>
        <span>{sale.id}</span>
      </div>
      {cashierName && (
        <div className={styles.metaRow}>
          <span>Cashier</span>
          <span>{cashierName}</span>
        </div>
      )}

      <hr className={styles.divider} />

      {sale.lines.map((line) => {
        const detail = lineDetails?.[line.variantId];
        return (
          <div key={line.id} className={styles.lineItem}>
            <div className={styles.lineItemTop}>
              <span>{line.productNameSnapshot}</span>
              <span>{money(line.lineTotal, sale.currency)}</span>
            </div>
            {detail && (
              <div className={styles.lineItemMeta}>
                SKU {detail.sku} · Size: {detail.size} | {detail.color}
              </div>
            )}
            <div className={styles.lineItemQty}>
              <span>
                {line.quantity} × {money(line.unitPrice, sale.currency)}
              </span>
              {Number(line.lineDiscount) > 0 && <span>-{money(line.lineDiscount, sale.currency)}</span>}
            </div>
          </div>
        );
      })}

      <hr className={styles.divider} />

      <div className={styles.summaryRow}>
        <span>Subtotal</span>
        <span>{money(sale.subtotal, sale.currency)}</span>
      </div>
      {Number(sale.discountTotal) > 0 && (
        <div className={`${styles.summaryRow} ${styles.discountRow}`}>
          <span>Discount</span>
          <span>-{money(sale.discountTotal, sale.currency)}</span>
        </div>
      )}
      {Number(sale.taxTotal) > 0 && (
        <div className={styles.summaryRow}>
          <span>Tax</span>
          <span>{money(sale.taxTotal, sale.currency)}</span>
        </div>
      )}
      <div className={styles.totalRow}>
        <span>Total</span>
        <span>{money(sale.totalAmount, sale.currency)}</span>
      </div>

      <hr className={styles.divider} />

      <div className={styles.paymentSection}>
        {sale.payments.map((p) => (
          <div key={p.id} className={styles.summaryRow}>
            <span>{PAYMENT_LABELS[p.method]}{p.reference ? ` (${p.reference})` : ''}</span>
            <span>{money(p.amount, sale.currency)}</span>
          </div>
        ))}
        {cashReceived != null && (
          <div className={styles.summaryRow}>
            <span>Cash received</span>
            <span>{money(cashReceived, sale.currency)}</span>
          </div>
        )}
        {change != null && change > 0 && (
          <div className={styles.summaryRow}>
            <span>Change</span>
            <span>{money(change, sale.currency)}</span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerThanks}>Thank you for shopping with BATA!</div>
        <div>Please keep this receipt for any exchange.</div>
      </div>
    </div>
  );
}
