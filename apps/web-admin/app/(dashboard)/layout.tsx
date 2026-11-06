'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/auth-store';
import { useCurrentUser } from '../../lib/use-current-user';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import styles from './dashboard-layout.module.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const hasSessionInStore = useAuthStore((s) => Boolean(s.accessToken || s.refreshToken));
  const { data: user, isError } = useCurrentUser();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!hasSessionInStore || isError) {
      router.replace('/login');
    }
  }, [hasHydrated, hasSessionInStore, isError, router]);

  if (!hasHydrated || !hasSessionInStore) {
    return <div className={styles.loadingScreen}>Loading…</div>;
  }

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar user={user ?? null} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
