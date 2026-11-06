'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { BranchSalesRow, SalesBucket } from '@bata-pos/shared-types';
import { reportingApi } from '../../../lib/api';
import { useCurrentUser } from '../../../lib/use-current-user';
import { Card, Select, Table } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import styles from './page.module.css';
import adminStyles from '../components/admin-page.module.css';

function money(amount: string): string {
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReportsPage() {
  const { data: user } = useCurrentUser();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const tenantId = user?.tenantId ?? undefined;

  const kpis = useQuery({
    queryKey: ['dashboard-kpis', tenantId],
    queryFn: () => reportingApi.dashboardKpis({ tenantId }),
    enabled: Boolean(user),
  });

  const salesReport = useQuery({
    queryKey: ['sales-report', tenantId, period],
    queryFn: () => reportingApi.salesReport({ tenantId, period }),
    enabled: Boolean(user),
  });

  const byBranch = useQuery({
    queryKey: ['sales-by-branch', tenantId],
    queryFn: () => reportingApi.salesByBranch({ tenantId }),
    enabled: Boolean(user),
  });

  const reportError = (error: unknown) =>
    error
      ? isAxiosError(error) && !error.response
        ? 'Cannot reach the Reporting service. Is it running?'
        : isAxiosError(error) && error.response?.status === 400
          ? 'A tenant context is required to view reports.'
          : 'Failed to load this report.'
      : null;

  return (
    <RequirePermission permission="reports.read">
    <div>
      <div className={adminStyles.header}>
        <div>
          <p className={adminStyles.title}>Sales Reports</p>
          <p className={adminStyles.subtitle}>Live figures from Reporting &amp; Integration.</p>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <Card>
          <p className={styles.kpiLabel}>Total Sales</p>
          <p className={styles.kpiValue}>{kpis.data?.totalSales ?? '—'}</p>
        </Card>
        <Card>
          <p className={styles.kpiLabel}>Gross Revenue</p>
          <p className={styles.kpiValue}>{kpis.data ? money(kpis.data.totalGross) : '—'}</p>
        </Card>
        <Card>
          <p className={styles.kpiLabel}>Net Revenue</p>
          <p className={styles.kpiValue}>{kpis.data ? money(kpis.data.totalNet) : '—'}</p>
        </Card>
        <Card>
          <p className={styles.kpiLabel}>Out of Stock Variants</p>
          <p className={styles.kpiValue}>{kpis.data?.outOfStockVariantCount ?? '—'}</p>
        </Card>
      </div>

      <div className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p className={styles.sectionTitle}>Sales Over Time</p>
          <div style={{ width: 160 }}>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </div>
        </div>
        <Card>
          <Table<SalesBucket>
            columns={[
              { key: 'period', header: 'Period', render: (r) => new Date(r.period).toLocaleDateString() },
              { key: 'count', header: 'Sales', render: (r) => r.saleCount },
              { key: 'gross', header: 'Gross', render: (r) => money(r.grossAmount) },
              { key: 'refunded', header: 'Refunded', render: (r) => money(r.refundedAmount) },
              { key: 'net', header: 'Net', render: (r) => money(r.netAmount) },
            ]}
            data={salesReport.data}
            rowKey={(r) => r.period}
            isLoading={salesReport.isLoading}
            error={reportError(salesReport.error)}
            emptyMessage="No sales recorded in this period yet."
          />
        </Card>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Sales by Branch</p>
        <Card>
          <Table<BranchSalesRow>
            columns={[
              { key: 'branch', header: 'Branch', render: (r) => <code title={r.branchId}>{r.branchId.slice(0, 8)}…</code> },
              { key: 'count', header: 'Sales', render: (r) => r.saleCount },
              { key: 'gross', header: 'Gross', render: (r) => money(r.grossAmount) },
              { key: 'net', header: 'Net', render: (r) => money(r.netAmount) },
            ]}
            data={byBranch.data}
            rowKey={(r) => r.branchId}
            isLoading={byBranch.isLoading}
            error={reportError(byBranch.error)}
            emptyMessage="No branch sales data yet."
          />
        </Card>
      </div>
    </div>
    </RequirePermission>
  );
}
