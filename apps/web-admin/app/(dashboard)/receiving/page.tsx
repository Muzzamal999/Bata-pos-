'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { StockInwardReceipt } from '@bata-pos/shared-types';
import { productInventoryApi } from '../../../lib/api';
import { useHasPermission } from '../../../lib/permissions';
import { Badge, Button, Card, LinkButton, Modal, Table } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import { CreateReceiptForm } from './create-receipt-form';
import styles from '../components/admin-page.module.css';

const STATUS_BADGE: Record<string, BadgeVariant> = {
  DRAFT: 'neutral',
  CONFIRMED: 'success',
};

export default function ReceivingPage() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const canRead = useHasPermission('stock_inward.read');
  const canCreate = useHasPermission('stock_inward.create');

  const { data, isLoading, error } = useQuery({
    queryKey: ['receipts'],
    queryFn: () => productInventoryApi.listReceipts({ limit: 100 }),
    enabled: canRead,
  });

  return (
    <RequirePermission permission="stock_inward.read">
      <div>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Stock Receiving</p>
            <p className={styles.subtitle}>Receive incoming stock against a purchase or supplier reference.</p>
          </div>
          {canCreate && <Button onClick={() => setCreateOpen(true)}>New Receipt</Button>}
        </div>

        <Card>
          <Table<StockInwardReceipt>
            columns={[
              { key: 'ref', header: 'Reference', render: (r) => r.referenceNumber },
              { key: 'supplier', header: 'Supplier Ref', render: (r) => r.supplierReference ?? '—' },
              { key: 'lines', header: 'Lines', render: (r) => r.lines.length },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>,
              },
              {
                key: 'actions',
                header: '',
                render: (r) => (
                  <LinkButton href={`/receiving/${r.id}`} size="sm" variant="secondary">
                    {r.status === 'DRAFT' ? 'Manage' : 'View'}
                  </LinkButton>
                ),
              },
            ]}
            data={data?.data}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            error={
              error
                ? isAxiosError(error) && !error.response
                  ? 'Cannot reach the Product & Inventory service. Is it running?'
                  : 'Failed to load receipts.'
                : null
            }
            emptyMessage="No stock receipts yet."
          />
        </Card>

        {isCreateOpen && (
          <Modal title="New Stock Receipt" onClose={() => setCreateOpen(false)}>
            <CreateReceiptForm onDone={() => setCreateOpen(false)} />
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
