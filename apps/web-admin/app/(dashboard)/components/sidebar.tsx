'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../../../lib/auth-store';
import { hasPermission, NAV_PERMISSIONS } from '../../../lib/permissions';
import styles from './sidebar.module.css';
import {
  OverviewIcon,
  BranchIcon,
  UsersIcon,
  ProductsIcon,
  InventoryIcon,
  ReceivingIcon,
  TransfersIcon,
  ReportsIcon,
  AuditIcon,
  SettingsIcon,
} from './icons';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: OverviewIcon, permission: NAV_PERMISSIONS.overview },
  { href: '/branches', label: 'Branches', icon: BranchIcon, permission: NAV_PERMISSIONS.branches },
  { href: '/users', label: 'Users', icon: UsersIcon, permission: NAV_PERMISSIONS.users },
  { href: '/products', label: 'Products', icon: ProductsIcon, permission: NAV_PERMISSIONS.products },
  { href: '/inventory', label: 'Inventory', icon: InventoryIcon, permission: NAV_PERMISSIONS.inventory },
  { href: '/receiving', label: 'Receiving', icon: ReceivingIcon, permission: NAV_PERMISSIONS.receiving },
  { href: '/transfers', label: 'Transfers', icon: TransfersIcon, permission: NAV_PERMISSIONS.transfers },
  { href: '/reports', label: 'Reports', icon: ReportsIcon, permission: NAV_PERMISSIONS.reports },
  { href: '/audit', label: 'Audit Log', icon: AuditIcon, permission: NAV_PERMISSIONS.audit },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, permission: NAV_PERMISSIONS.settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const permissions = useAuthStore((s) => s.user?.permissions);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.wordmark}>Bata</span>
      </div>
      <nav className={styles.nav} aria-label="Admin navigation">
        {NAV_ITEMS.filter((item) => hasPermission(permissions, item.permission)).map(
          ({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={styles.navIcon}>
                  <Icon />
                </span>
                {label}
              </Link>
            );
          },
        )}
      </nav>
    </aside>
  );
}
