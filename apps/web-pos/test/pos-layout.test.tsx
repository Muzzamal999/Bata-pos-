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

import PosLayout from '../app/(pos)/layout';

describe('POS layout (authentication guard)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      selectedBranchId: null,
      hasHydrated: false,
    });
  });

  it('redirects to /login when there is no session at all', async () => {
    useCurrentUserMock.mockReturnValue({ isError: false });
    useAuthStore.setState({ accessToken: null, refreshToken: null, hasHydrated: true });

    render(
      <PosLayout>
        <div>Protected content</div>
      </PosLayout>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects to /login when the session has expired (whoami fails even with stored tokens)', async () => {
    useCurrentUserMock.mockReturnValue({ isError: true });
    useAuthStore.setState({ accessToken: 'stale', refreshToken: 'stale', hasHydrated: true });

    render(
      <PosLayout>
        <div>Protected content</div>
      </PosLayout>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('does not redirect, and renders children, for a valid session', async () => {
    useCurrentUserMock.mockReturnValue({ isError: false });
    useAuthStore.setState({ accessToken: 'valid', refreshToken: 'valid', hasHydrated: true });

    render(
      <PosLayout>
        <div>Protected content</div>
      </PosLayout>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a loading state before storage has rehydrated, never a redirect', () => {
    useCurrentUserMock.mockReturnValue({ isError: false });
    useAuthStore.setState({ hasHydrated: false });

    render(
      <PosLayout>
        <div>Protected content</div>
      </PosLayout>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
