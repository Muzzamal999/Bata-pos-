'use client';

import { ReactNode } from 'react';
import { useHasPermission } from '../lib/permissions';
import { EmptyState } from './ui';

/**
 * Route-level permission gate. Checked client-side for UX (hide the form
 * entirely rather than let someone submit into a guaranteed 403) - the real
 * enforcement is, and must remain, server-side on each backend endpoint.
 * This is a convenience layer, not the security boundary.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const allowed = useHasPermission(permission);

  if (!allowed) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description={`This requires the "${permission}" permission, which your account doesn't currently have.`}
      />
    );
  }

  return <>{children}</>;
}
