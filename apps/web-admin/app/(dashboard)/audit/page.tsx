'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { AuditLogEntry } from '@bata-pos/shared-types';
import { reportingApi } from '../../../lib/api';
import { useCurrentUser } from '../../../lib/use-current-user';
import { Card, Input, Table } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import styles from '../components/admin-page.module.css';

export default function AuditPage() {
  const { data: user } = useCurrentUser();
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const tenantId = user?.tenantId ?? undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', tenantId, entityType, action],
    queryFn: () =>
      reportingApi.listAuditLogs({
        tenantId,
        entityType: entityType || undefined,
        action: action || undefined,
        limit: 100,
      }),
    enabled: Boolean(user),
  });

  return (
    <RequirePermission permission="audit.read">
      <div>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Audit Log</p>
            <p className={styles.subtitle}>Immutable record of what changed, by whom, and when.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <Input
              label="Entity Type"
              placeholder="e.g. Price, StockMovement"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <Input
              label="Action"
              placeholder="e.g. price.updated"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <Table<AuditLogEntry>
            columns={[
              { key: 'time', header: 'When', render: (e) => new Date(e.createdAt).toLocaleString() },
              { key: 'action', header: 'Action', render: (e) => e.action },
              { key: 'entityType', header: 'Entity', render: (e) => e.entityType },
              {
                key: 'entityId',
                header: 'Entity ID',
                render: (e) => (e.entityId ? <code title={e.entityId}>{e.entityId.slice(0, 8)}…</code> : '—'),
              },
              {
                key: 'actor',
                header: 'Actor',
                render: (e) => (e.actorUserId ? <code title={e.actorUserId}>{e.actorUserId.slice(0, 8)}…</code> : 'System'),
              },
            ]}
            data={data?.items}
            rowKey={(e) => e.id}
            isLoading={isLoading}
            error={
              error
                ? isAxiosError(error) && !error.response
                  ? 'Cannot reach the Reporting service. Is it running?'
                  : isAxiosError(error) && error.response?.status === 400
                    ? 'A tenant context is required to view the audit log.'
                    : 'Failed to load the audit log.'
                : null
            }
            emptyMessage="No audit entries match these filters yet."
          />
        </Card>
      </div>
    </RequirePermission>
  );
}
