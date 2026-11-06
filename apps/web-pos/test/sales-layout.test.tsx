import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '../lib/auth-store';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock('../lib/use-current-user', () => ({
  useCurrentUser: () => ({ data: undefined }),
}));

vi.mock('../app/(pos)/components/header', () => ({ Header: () => <header>header</header> }));

import SalesLayout from '../app/(pos)/sales/layout';

describe('Sales layout (branch-context guard)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ selectedBranchId: null });
  });

  it('redirects to /select-branch when no branch has been chosen - prevents reaching POS sales without valid context', async () => {
    useAuthStore.setState({ selectedBranchId: null });

    render(
      <SalesLayout>
        <div>Sales screen</div>
      </SalesLayout>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/select-branch'));
    expect(screen.queryByText('Sales screen')).not.toBeInTheDocument();
  });

  it('renders the header and children once a branch is selected', () => {
    useAuthStore.setState({ selectedBranchId: 'branch-1' });

    render(
      <SalesLayout>
        <div>Sales screen</div>
      </SalesLayout>,
    );

    expect(screen.getByText('Sales screen')).toBeInTheDocument();
    expect(screen.getByText('header')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
