import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAuthStore } from '../lib/auth-store';
import { RequirePermission } from '../components/require-permission';

function userWith(permissions: string[]) {
  return {
    id: '1',
    tenantId: null,
    email: 'a@b.com',
    firstName: 'A',
    lastName: 'B',
    isActive: true,
    roles: [],
    permissions,
    branchIds: [],
  };
}

describe('RequirePermission (unauthorized route access)', () => {
  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('blocks access and shows a clear message when the user lacks the permission', () => {
    useAuthStore.setState({ user: userWith(['products.read']) });

    render(
      <RequirePermission permission="branches.read">
        <div>Branches content</div>
      </RequirePermission>,
    );

    expect(screen.queryByText('Branches content')).not.toBeInTheDocument();
    expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
    expect(screen.getByText(/branches\.read/)).toBeInTheDocument();
  });

  it('renders the protected content when the user has the permission', () => {
    useAuthStore.setState({ user: userWith(['branches.read']) });

    render(
      <RequirePermission permission="branches.read">
        <div>Branches content</div>
      </RequirePermission>,
    );

    expect(screen.getByText('Branches content')).toBeInTheDocument();
    expect(screen.queryByText(/don't have access/i)).not.toBeInTheDocument();
  });

  it('blocks access when there is no authenticated user at all', () => {
    useAuthStore.setState({ user: null });

    render(
      <RequirePermission permission="branches.read">
        <div>Branches content</div>
      </RequirePermission>,
    );

    expect(screen.queryByText('Branches content')).not.toBeInTheDocument();
  });
});
