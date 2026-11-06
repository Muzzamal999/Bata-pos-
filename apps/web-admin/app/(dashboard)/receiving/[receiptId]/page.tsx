'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockInwardLine } from '@bata-pos/shared-types';
import { productInventoryApi } from '../../../../lib/api';
import { useHasPermission } from '../../../../lib/permissions';
import { Badge, Button, Card, Modal, Table } from '../../../../components/ui';
import { RequirePermission } from '../../../../components/require-permission';
import { AddLineForm } from './add-line-form';
import adminStyles from '../../components/admin-page.module.css';

export default function ReceiptDetailPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = use(params);
  const [isAddLineOpen, setAddLineOpen] = useState(false);
  const queryClient = useQueryClient();
  const canUpdate = useHasPermission('stock_inward.update');
  const canConfirm = useHasPermission('stock_inward.confirm');

  const { data: receipt, isLoading, error } = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => productInventoryApi.getReceipt(receiptId),
  });

  const confirm = useMutation({
    mutationFn: () => productInventoryApi.confirmReceipt(receiptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receipt', receiptId] }),
  });

  const isDraft = receipt?.status === 'DRAFT';

  return (
    <RequirePermission permission="stock_inward.read">
      <div>
        <Link href="/receiving" style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'inline-block', marginBottom: 12 }}>
          ← Back to Stock Receiving
        </Link>

        {error && <p style={{ color: 'var(--color-danger)' }}>Could not load this receipt.</p>}

        {receipt && (
          <>
            <div className={adminStyles.header}>
              <div>
                <p className={adminStyles.title}>{receipt.referenceNumber}</p>
                <p className={adminStyles.subtitle}>{receipt.supplierReference ?? 'No supplier reference'}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Badge variant={isDraft ? 'neutral' : 'success'}>{receipt.status}</Badge>
                {isDraft && canConfirm && (
                  <Button loading={confirm.isPending} onClick={() => confirm.mutate()} disabled={receipt.lines.length === 0}>
                    Confirm Receipt
                  </Button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 12px' }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Lines</p>
              {isDraft && canUpdate && (
                <Button size="sm" onClick={() => setAddLineOpen(true)}>
                  Add Line
                </Button>
              )}
            </div>

            <Card>
              <Table<StockInwardLine>
                columns={[
                  {
                    key: 'variant',
                    header: 'Variant',
                    render: (l) => <code title={l.variantId}>{l.variantId.slice(0, 8)}…</code>,
                  },
                  { key: 'expected', header: 'Expected Qty', render: (l) => l.expectedQty },
                  { key: 'received', header: 'Received Qty', render: (l) => l.receivedQty },
                ]}
                data={receipt.lines}
                rowKey={(l) => l.id}
                isLoading={isLoading}
                error={null}
                emptyMessage="No lines added yet. Add at least one line before confirming."
              />
            </Card>
          </>
        )}

        {isAddLineOpen && (
          <Modal title="Add Line" onClose={() => setAddLineOpen(false)}>
            <AddLineForm receiptId={receiptId} onDone={() => setAddLineOpen(false)} />
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
