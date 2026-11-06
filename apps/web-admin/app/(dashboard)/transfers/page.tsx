'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { StockTransfer, StockTransferStatus } from '@bata-pos/shared-types';
import { productInventoryApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { hasPermission, useHasPermission } from '../../../lib/permissions';
import { Badge, Button, Card, Modal, Table } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import { CreateTransferForm } from './create-transfer-form';
import styles from '../components/admin-page.module.css';

const STATUS_BADGE: Record<StockTransferStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  REQUESTED: 'info',
  APPROVED: 'info',
  REJECTED: 'danger',
  DISPATCHED: 'warning',
  IN_TRANSIT: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'danger',
};

const NEXT_ACTION: Partial<
  Record<StockTransferStatus, { label: string; method: keyof typeof productInventoryApi; permission: string }>
> = {
  DRAFT: { label: 'Request', method: 'requestTransfer', permission: 'transfers.request' },
  REQUESTED: { label: 'Approve', method: 'approveTransfer', permission: 'transfers.approve' },
  APPROVED: { label: 'Dispatch', method: 'dispatchTransfer', permission: 'transfers.dispatch' },
  DISPATCHED: {
    label: 'Mark In Transit',
    method: 'markTransferInTransit',
    permission: 'transfers.mark_in_transit',
  },
  IN_TRANSIT: { label: 'Receive', method: 'receiveTransfer', permission: 'transfers.receive' },
};

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export default function TransfersPage() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const permissions = useAuthStore((s) => s.user?.permissions);
  const canRead = useHasPermission('transfers.read');
  const canCreate = useHasPermission('transfers.create');
  const canCancel = useHasPermission('transfers.cancel');
  const canReject = useHasPermission('transfers.reject');

  const { data, isLoading, error } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => productInventoryApi.listTransfers({ limit: 100 }),
    enabled: canRead,
  });

  const advance = useMutation({
    mutationFn: (transfer: StockTransfer) => {
      const action = NEXT_ACTION[transfer.status];
      if (!action) return Promise.reject(new Error('No action available'));
      const fn = productInventoryApi[action.method] as (id: string) => Promise<StockTransfer>;
      return fn.call(productInventoryApi, transfer.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transfers'] }),
  });

  const cancel = useMutation({
    mutationFn: (transfer: StockTransfer) => productInventoryApi.cancelTransfer(transfer.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transfers'] }),
  });

  const reject = useMutation({
    mutationFn: (transfer: StockTransfer) => productInventoryApi.rejectTransfer(transfer.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transfers'] }),
  });

  return (
    <RequirePermission permission="transfers.read">
      <div>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Stock Transfers</p>
            <p className={styles.subtitle}>Move inventory between branches.</p>
          </div>
          {canCreate && <Button onClick={() => setCreateOpen(true)}>New Transfer</Button>}
        </div>

        <Card>
          <Table<StockTransfer>
            columns={[
              { key: 'ref', header: 'Reference', render: (t) => t.referenceNumber },
              {
                key: 'source',
                header: 'From',
                render: (t) => <code title={t.sourceBranchId}>{shortId(t.sourceBranchId)}</code>,
              },
              {
                key: 'destination',
                header: 'To',
                render: (t) => <code title={t.destinationBranchId}>{shortId(t.destinationBranchId)}</code>,
              },
              { key: 'lines', header: 'Lines', render: (t) => t.lines.length },
              {
                key: 'status',
                header: 'Status',
                render: (t) => <Badge variant={STATUS_BADGE[t.status]}>{t.status.replace('_', ' ')}</Badge>,
              },
              {
                key: 'actions',
                header: '',
                render: (t) => {
                  const action = NEXT_ACTION[t.status];
                  const canAdvance = action && hasPermission(permissions, action.permission);
                  const canCancelThis =
                    canCancel && t.status !== 'CANCELLED' && t.status !== 'RECEIVED' && t.status !== 'REJECTED';
                  const canRejectThis = canReject && t.status === 'REQUESTED';
                  return (
                    <div className={styles.rowActions}>
                      {canAdvance && (
                        <Button
                          size="sm"
                          loading={advance.isPending && advance.variables?.id === t.id}
                          onClick={() => advance.mutate(t)}
                        >
                          {action.label}
                        </Button>
                      )}
                      {canRejectThis && (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={reject.isPending && reject.variables?.id === t.id}
                          onClick={() => reject.mutate(t)}
                        >
                          Reject
                        </Button>
                      )}
                      {canCancelThis && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={cancel.isPending && cancel.variables?.id === t.id}
                          onClick={() => cancel.mutate(t)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  );
                },
              },
            ]}
            data={data?.data}
            rowKey={(t) => t.id}
            isLoading={isLoading}
            error={
              error
                ? isAxiosError(error) && !error.response
                  ? 'Cannot reach the Product & Inventory service. Is it running?'
                  : 'Failed to load transfers.'
                : null
            }
            emptyMessage="No stock transfers yet."
          />
        </Card>

        {isCreateOpen && (
          <Modal title="New Stock Transfer" onClose={() => setCreateOpen(false)}>
            <CreateTransferForm onDone={() => setCreateOpen(false)} />
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
