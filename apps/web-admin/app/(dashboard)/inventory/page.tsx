'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { StockBalance } from '@bata-pos/shared-types';
import { identityApi, productInventoryApi } from '../../../lib/api';
import { useHasPermission } from '../../../lib/permissions';
import { Badge, Button, Card, Modal, Select, Table } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import { RecordMovementForm } from './record-movement-form';
import styles from '../components/admin-page.module.css';

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export default function InventoryPage() {
  const [isRecordOpen, setRecordOpen] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const canRead = useHasPermission('inventory.read');
  const canStockIn = useHasPermission('inventory.stock_in');
  const canStockOut = useHasPermission('inventory.stock_out');
  const canMarkDamaged = useHasPermission('inventory.mark_damaged');
  const canAdjust = useHasPermission('inventory.adjust');
  const canRecordAny = canStockIn || canStockOut || canMarkDamaged || canAdjust;

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => identityApi.listBranches({ limit: 100 }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-balances', branchId, lowStockOnly],
    queryFn: () =>
      productInventoryApi.listBalances({
        limit: 100,
        branchId: branchId || undefined,
        lowStockOnly: lowStockOnly || undefined,
      }),
    enabled: canRead,
  });

  return (
    <RequirePermission permission="inventory.read">
      <div>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Inventory</p>
            <p className={styles.subtitle}>Stock balances across all locations.</p>
          </div>
          {canRecordAny && <Button onClick={() => setRecordOpen(true)}>Record Movement</Button>}
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">All branches</option>
              {branches?.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingBottom: 10 }}>
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
            />
            Low stock only
          </label>
        </div>

        <Card>
          <Table<StockBalance>
            columns={[
              {
                key: 'variant',
                header: 'Variant',
                render: (b) => <code title={b.variantId}>{shortId(b.variantId)}</code>,
              },
              { key: 'onHand', header: 'On Hand', render: (b) => b.onHandQty },
              { key: 'reserved', header: 'Reserved', render: (b) => b.reservedQty },
              { key: 'available', header: 'Available', render: (b) => b.availableQty },
              {
                key: 'threshold',
                header: 'Status',
                render: (b) =>
                  b.lowStockThreshold != null && b.onHandQty <= b.lowStockThreshold ? (
                    <Badge variant="warning">Low Stock</Badge>
                  ) : (
                    <Badge variant="success">OK</Badge>
                  ),
              },
            ]}
            data={data?.data}
            rowKey={(b) => b.id}
            isLoading={isLoading}
            error={
              error
                ? isAxiosError(error) && !error.response
                  ? 'Cannot reach the Product & Inventory service. Is it running?'
                  : 'Failed to load stock balances.'
                : null
            }
            emptyMessage="No stock balances recorded yet."
          />
        </Card>

        {isRecordOpen && (
          <Modal title="Record Stock Movement" onClose={() => setRecordOpen(false)}>
            <RecordMovementForm onDone={() => setRecordOpen(false)} />
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
