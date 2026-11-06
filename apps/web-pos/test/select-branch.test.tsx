import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQueryClient } from './test-utils';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const getBranchMock = vi.fn();
vi.mock('../lib/api', () => ({
  identityApi: {
    getBranch: (...args: unknown[]) => getBranchMock(...args),
  },
}));

const setSelectedBranchMock = vi.fn();
const clearMock = vi.fn();
vi.mock('../lib/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ setSelectedBranch: setSelectedBranchMock, clear: clearMock }),
  },
}));

const useCurrentUserMock = vi.fn();
vi.mock('../lib/use-current-user', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

import SelectBranchPage from '../app/(pos)/select-branch/page';

describe('Branch selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retrieves and displays every branch the authenticated cashier is authorized for, by name and code', async () => {
    useCurrentUserMock.mockReturnValue({ data: { branchIds: ['b1', 'b2'] } });
    getBranchMock.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'b1'
          ? { id: 'b1', code: '418', name: 'Kotli Main Branch' }
          : { id: 'b2', code: '512', name: 'Mirpur Branch' },
      ),
    );

    renderWithQueryClient(<SelectBranchPage />);

    expect(await screen.findByText('Kotli Main Branch')).toBeInTheDocument();
    expect(screen.getByText('418')).toBeInTheDocument();
    expect(screen.getByText('Mirpur Branch')).toBeInTheDocument();
    expect(screen.getByText('512')).toBeInTheDocument();
    expect(getBranchMock).toHaveBeenCalledWith('b1');
    expect(getBranchMock).toHaveBeenCalledWith('b2');
  });

  it('selecting a branch saves it to the session and proceeds to sales', async () => {
    useCurrentUserMock.mockReturnValue({ data: { branchIds: ['b1'] } });
    getBranchMock.mockResolvedValue({ id: 'b1', code: '418', name: 'Kotli Main Branch' });

    const user = userEvent.setup();
    renderWithQueryClient(<SelectBranchPage />);

    const card = await screen.findByText('Kotli Main Branch');
    await user.click(card);

    expect(setSelectedBranchMock).toHaveBeenCalledWith('b1');
    expect(pushMock).toHaveBeenCalledWith('/sales');
  });

  it('shows a clear message, and no selectable branches, when the account has no branch assignments', () => {
    useCurrentUserMock.mockReturnValue({ data: { branchIds: [] } });

    renderWithQueryClient(<SelectBranchPage />);

    expect(screen.getByText(/no branches are assigned/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /branch/i })).not.toBeInTheDocument();
  });

  it('surfaces an authorization error instead of a blank or crashed screen', async () => {
    useCurrentUserMock.mockReturnValue({ data: { branchIds: ['b1'] } });
    getBranchMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: 'Insufficient permissions' } },
    });

    renderWithQueryClient(<SelectBranchPage />);

    expect(await screen.findByText(/doesn't have permission/i)).toBeInTheDocument();
  });
});
