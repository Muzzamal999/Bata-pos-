'use client';

import { useRouter } from 'next/navigation';
import { useThemeStore } from '../../../lib/theme-store';
import { useAuthStore } from '../../../lib/auth-store';
import { identityApi } from '../../../lib/api';
import type { CurrentUser } from '@bata-pos/shared-types';
import styles from './topbar.module.css';
import { BellIcon, SunIcon, MoonIcon, LogoutIcon } from './icons';

function initialsFor(user: CurrentUser): string {
  const first = user.firstName?.[0] ?? '';
  const last = user.lastName?.[0] ?? '';
  return (first + last).toUpperCase() || user.email[0]?.toUpperCase() || '?';
}

export function Topbar({ user }: { user: CurrentUser | null }) {
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  async function handleLogout() {
    const refreshToken = useAuthStore.getState().refreshToken;
    try {
      if (refreshToken) {
        await identityApi.logout(refreshToken);
      }
    } catch {
      // Best-effort: the token is being discarded client-side regardless.
    } finally {
      useAuthStore.getState().clear();
      router.push('/login');
    }
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.search}>
        <input className={styles.searchInput} placeholder="Search anything…" aria-label="Search" />
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button type="button" className={styles.iconButton} aria-label="Notifications">
          <BellIcon />
        </button>
        <button type="button" className={styles.iconButton} onClick={handleLogout} aria-label="Sign out">
          <LogoutIcon />
        </button>
        {user && (
          <div className={styles.profile}>
            <div className={styles.avatar}>{initialsFor(user)}</div>
            <div className={styles.profileText}>
              <span className={styles.profileName}>
                {user.firstName} {user.lastName}
              </span>
              <span className={styles.profileRole}>{user.roles[0] ?? 'User'}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
