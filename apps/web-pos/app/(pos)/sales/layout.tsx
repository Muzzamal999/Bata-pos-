'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../lib/auth-store';
import { useCurrentUser } from '../../../lib/use-current-user';
import { Header } from '../components/header';
import styles from './sales-guard-layout.module.css';

/** POS sales screens are unreachable without a chosen branch - no valid context, no access. */
export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const selectedBranchId = useAuthStore((s) => s.selectedBranchId);
  const { data: user } = useCurrentUser();

  useEffect(() => {
    if (!selectedBranchId) {
      router.replace('/select-branch');
    }
  }, [selectedBranchId, router]);

  if (!selectedBranchId) {
    return <div className={styles.loadingScreen}>Redirecting to branch selection…</div>;
  }

  return (
    <div className={styles.shell}>
      <Header user={user ?? null} />
      {children}
    </div>
  );
}
