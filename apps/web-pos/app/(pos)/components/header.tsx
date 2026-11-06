'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { CurrentUser } from '@bata-pos/shared-types';
import { identityApi, salesPosApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { useThemeStore } from '../../../lib/theme-store';
import styles from './header.module.css';

function initials(user: CurrentUser): string {
  const combined = (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '');
  return combined.toUpperCase() || user.email[0]?.toUpperCase() || '?';
}

export function Header({ user }: { user: CurrentUser | null }) {
  const router = useRouter();
  const branchId = useAuthStore((s) => s.selectedBranchId);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const { data: branch, isError: branchError } = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => identityApi.getBranch(branchId!),
    enabled: Boolean(branchId),
    retry: false,
  });

  const { data: currentShift } = useQuery({
    queryKey: ['current-shift'],
    queryFn: () => salesPosApi.getCurrentShift(),
    retry: false,
  });

  async function handleLogout() {
    const refreshToken = useAuthStore.getState().refreshToken;
    try {
      if (refreshToken) await identityApi.logout(refreshToken);
    } catch {
      // Best-effort: the session is being discarded client-side regardless.
    } finally {
      useAuthStore.getState().clear();
      router.push('/login');
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <span className={styles.wordmark}>Bata</span>
        <span className={styles.title}>POS - Sales</span>
      </div>
      <div className={styles.right}>
        <button
          type="button"
          className={styles.branch}
          onClick={() => router.push('/select-branch')}
          title="Switch branch"
        >
          {branch
            ? `${branch.code} - ${branch.name}`
            : branchError
              ? `Branch ${branchId!.slice(0, 8)}…`
              : 'Loading branch…'}
        </button>
        <button
          type="button"
          className={styles.shiftPill}
          onClick={() => router.push('/shift')}
          title="Shift management"
        >
          <span className={`${styles.shiftDot} ${currentShift ? styles.shiftDotOpen : ''}`} />
          {currentShift ? 'Shift Open' : 'No Shift'}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => router.push('/reprint')}
          aria-label="Sale lookup, returns and receipts"
          title="Sale lookup, returns and receipts"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            </svg>
          )}
        </button>
        <button type="button" className={styles.profile} onClick={handleLogout} title="Sign out">
          <span className={styles.avatar}>{user ? initials(user) : '?'}</span>
          <span className={styles.profileName}>{user?.firstName ?? 'Cashier'}</span>
        </button>
      </div>
    </header>
  );
}
