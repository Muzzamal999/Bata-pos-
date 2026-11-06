import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQueryClient } from './test-utils';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const logoutMock = vi.fn();
const getBranchMock = vi.fn();
const getCurrentShiftMock = vi.fn();
vi.mock('../lib/api', () => ({
  identityApi: {
    logout: (...args: unknown[]) => logoutMock(...args),
    getBranch: (...args: unknown[]) => getBranchMock(...args),
  },
  salesPosApi: {
    getCurrentShift: (...args: unknown[]) => getCurrentShiftMock(...args),
  },
}));

const clearMock = vi.fn();
vi.mock('../lib/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { selectedBranchId: string | null; refreshToken: string | null }) => unknown) =>
      selector({ selectedBranchId: 'branch-1', refreshToken: 'rt' }),
    { getState: () => ({ refreshToken: 'rt', clear: clearMock }) },
  ),
}));

import { Header } from '../app/(pos)/components/header';

describe('Cashier logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBranchMock.mockResolvedValue({ id: 'branch-1', code: '418', name: 'Kotli Main Branch' });
    getCurrentShiftMock.mockResolvedValue(null);
  });

  it('calls the real logout endpoint, clears the session, and returns to login', async () => {
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithQueryClient(<Header user={{ id: '1', firstName: 'Ayesha', lastName: 'Khan', email: 'a@b.com' } as never} />);

    await user.click(screen.getByTitle('Sign out'));

    expect(logoutMock).toHaveBeenCalledWith('rt');
    expect(clearMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/login');
  });

  it('still clears the local session and redirects even if the logout call fails', async () => {
    logoutMock.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();

    renderWithQueryClient(<Header user={{ id: '1', firstName: 'Ayesha', lastName: 'Khan', email: 'a@b.com' } as never} />);

    await user.click(screen.getByTitle('Sign out'));

    expect(clearMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/login');
  });
});
