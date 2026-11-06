'use client';

import { useCurrentUser } from '../../../lib/use-current-user';
import { Header } from '../components/header';
import styles from '../sales/sales-guard-layout.module.css';

export default function ReprintLayout({ children }: { children: React.ReactNode }) {
  const { data: user } = useCurrentUser();

  return (
    <div className={styles.shell}>
      <Header user={user ?? null} />
      {children}
    </div>
  );
}
