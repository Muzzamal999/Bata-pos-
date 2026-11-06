import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '../lib/auth-store';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const useCurrentUserMock = vi.fn();
vi.mock('../lib/use-current-user', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

vi.mock('../app/(dashboard)/components/sidebar', () => ({ Sidebar: () => <nav>sidebar</nav> }));
vi.mock('../app/(dashboard)/components/topbar', () => ({ Topbar: () => <header>topbar</header> }));

import DashboardLayout from '../app/(dashboard)/layout';

describe('Dashboard layout (unauthorized route access & expired session)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, hasHydrated: false });
  });

  it('redirects to /login when there is no session at all', async () => {
    useCurrentUserMock.mockReturnValue({ data: undefined, isError: false });
    useAuthStore.setState({ accessToken: null, refreshToken: null, hasHydrated: true });

    render(
      <DashboardLayout>
        <div>Protected content</div>
      </DashboardLayout>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects to /login when the session has expired (whoami fails even with stored tokens)', async () => {
    useCurrentUserMock.mockReturnValue({ data: undefined, isError: true });
    useAuthStore.setState({ accessToken: 'stale', refreshToken: 'stale', hasHydrated: true });

    render(
      <DashboardLayout>
        <div>Protected content</div>
      </DashboardLayout>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('does not redirect, and renders the shell, for a valid session', async () => {
    useCurrentUserMock.mockReturnValue({
      data: { id: '1', firstName: 'A', lastName: 'B', email: 'a@b.com', roles: [], permissions: [] },
      isError: false,
    });
    useAuthStore.setState({ accessToken: 'valid', refreshToken: 'valid', hasHydrated: true });

    render(
      <DashboardLayout>
        <div>Protected content</div>
      </DashboardLayout>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a loading state (not the shell, not a redirect) before storage has rehydrated', () => {
    useCurrentUserMock.mockReturnValue({ data: undefined, isError: false });
    useAuthStore.setState({ hasHydrated: false });

    render(
      <DashboardLayout>
        <div>Protected content</div>
      </DashboardLayout>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
