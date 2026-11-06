'use client';

import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '../../lib/use-current-user';
import { identityApi, productInventoryApi, reportingApi } from '../../lib/api';
import { Card } from '../../components/ui';
import styles from './page.module.css';

export default function OverviewPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenantId ?? undefined;

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => identityApi.listBranches({ limit: 1 }),
    enabled: Boolean(user),
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => identityApi.listUsers({ limit: 1 }),
    enabled: Boolean(user),
  });
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => productInventoryApi.listProducts({ limit: 1 }),
    enabled: Boolean(user),
  });
  const kpis = useQuery({
    queryKey: ['dashboard-kpis', tenantId],
    queryFn: () => reportingApi.dashboardKpis({ tenantId }),
    enabled: Boolean(user),
  });

  const stats = [
    { label: 'Branches', value: branches.data?.total },
    { label: 'Users', value: users.data?.total },
    { label: 'Products tracked', value: products.data?.total },
    { label: 'Out of stock items', value: kpis.data?.outOfStockVariantCount },
  ];

  return (
    <div>
      <section className={styles.welcomeBanner}>
        <h1 className={styles.welcomeTitle}>Welcome back{user ? `, ${user.firstName}` : ''}</h1>
        <p className={styles.welcomeSubtitle}>
          Manage your store, team and system settings from one place.
        </p>
      </section>

      <div className={styles.statsGrid}>
        {stats.map(({ label, value }) => (
          <Card key={label}>
            <p className={styles.statLabel}>{label}</p>
            <p className={styles.statValue}>{value ?? '—'}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
