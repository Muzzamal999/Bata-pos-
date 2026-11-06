'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/auth-store';
import { useCurrentUser } from '../../lib/use-current-user';
import styles from './pos-layout.module.css';

/**
 * Authenticates only. Branch context is enforced one level down (in the
 * sales route group's own layout) - select-branch itself must be reachable
 * by a logged-in cashier who has *not* picked a branch yet.
 */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const hasSessionInStore = useAuthStore((s) => Boolean(s.accessToken || s.refreshToken));
  const { isError } = useCurrentUser();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!hasSessionInStore || isError) {
      router.replace('/login');
    }
  }, [hasHydrated, hasSessionInStore, isError, router]);

  if (!hasHydrated || !hasSessionInStore) {
    return <div className={styles.loadingScreen}>Loading…</div>;
  }

  return <div className={styles.shell}>{children}</div>;
}
