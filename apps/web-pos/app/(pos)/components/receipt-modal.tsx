'use client';

import { useState } from 'react';
import type { Branch, Sale } from '@bata-pos/shared-types';
import { Modal } from '../../../components/ui';
import { Receipt, type LineDetail, type ReceiptLayout } from './receipt';
import styles from './receipt-modal.module.css';

const LAYOUTS: { value: ReceiptLayout; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: '80mm', label: '80mm' },
  { value: '58mm', label: '58mm' },
];

export function ReceiptModal({
  sale,
  branch,
  cashierName,
  lineDetails,
  cashReceived,
  onClose,
}: {
  sale: Sale;
  branch: Branch | null;
  cashierName: string | null;
  lineDetails?: Record<string, LineDetail>;
  cashReceived?: number;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState<ReceiptLayout>('a4');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sale.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - nothing more we can do client-side.
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <Modal title="Receipt" onClose={onClose}>
      <div className={styles.toolbar}>
        <div className={styles.layoutToggle} role="group" aria-label="Receipt layout">
          {LAYOUTS.map((l) => (
            <button
              key={l.value}
              type="button"
              className={layout === l.value ? styles.layoutButtonActive : styles.layoutButton}
              onClick={() => setLayout(l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={handleCopy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy #'}
          </button>
          <button type="button" className={styles.actionButton} onClick={handlePrint}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
          <button type="button" className={styles.actionButton} onClick={handlePrint} title="Uses your browser's Save as PDF option in the print dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      <div className={styles.receiptFrame}>
        <div className="print-area">
          <Receipt
            sale={sale}
            branch={branch}
            cashierName={cashierName}
            lineDetails={lineDetails}
            cashReceived={cashReceived}
            layout={layout}
          />
        </div>
      </div>
    </Modal>
  );
}
