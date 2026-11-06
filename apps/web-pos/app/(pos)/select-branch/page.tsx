'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { identityApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { useCurrentUser } from '../../../lib/use-current-user';
import styles from './select-branch.module.css';

export default function SelectBranchPage() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const branchIds = user?.branchIds ?? [];

  const { data: branches, isLoading, error } = useQuery({
    queryKey: ['my-branches', branchIds],
    // No "list my branches" endpoint exists - branchIds is the authoritative
    // list from the user's own JWT claim, so each one is resolved individually.
    queryFn: () => Promise.all(branchIds.map((id) => identityApi.getBranch(id))),
    enabled: branchIds.length > 0,
  });

  function handleSelect(branchId: string) {
    useAuthStore.getState().setSelectedBranch(branchId);
    router.push('/sales');
  }

  function handleSignOut() {
    useAuthStore.getState().clear();
    router.push('/login');
  }

  return (
    <div className={styles.page}>
      <span className={styles.wordmark}>Bata</span>
      <h1 className={styles.title}>Select Your Branch</h1>
      <p className={styles.subtitle}>Choose the branch you&apos;re working at for this session.</p>

      {branchIds.length === 0 && (
        <p className={styles.statusMessage}>
          No branches are assigned to your account. Contact your administrator to get branch
          access before you can start a sale.
        </p>
      )}

      {isLoading && <p className={styles.statusMessage}>Loading your branches…</p>}

      {error && (
        <p className={styles.statusMessage}>
          {isAxiosError(error) && error.response?.status === 403
            ? "Your account doesn't have permission to view branch details. Contact your administrator."
            : isAxiosError(error) && !error.response
              ? 'Cannot reach the Identity service. Is it running?'
              : 'Failed to load your branches.'}
        </p>
      )}

      {branches && branches.length > 0 && (
        <div className={styles.list}>
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={styles.branchCard}
              onClick={() => handleSelect(branch.id)}
            >
              <div>
                <div className={styles.branchName}>{branch.name}</div>
                <div className={styles.branchCode}>{branch.code}</div>
              </div>
              <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      )}

      <button type="button" className={styles.signOut} onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
