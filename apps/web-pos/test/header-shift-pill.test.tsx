import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const getBranchMock = vi.fn();
const getCurrentShiftMock = vi.fn();
vi.mock('../lib/api', () => ({
  identityApi: { logout: vi.fn(), getBranch: (...args: unknown[]) => getBranchMock(...args) },
  salesPosApi: { getCurrentShift: (...args: unknown[]) => getCurrentShiftMock(...args) },
}));

vi.mock('../lib/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { selectedBranchId: string | null; refreshToken: string | null }) => unknown) =>
      selector({ selectedBranchId: 'branch-1', refreshToken: 'rt' }),
    { getState: () => ({ refreshToken: 'rt', clear: vi.fn() }) },
  ),
}));

import { Header } from '../app/(pos)/components/header';

describe('Header shift indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBranchMock.mockResolvedValue({ id: 'branch-1', code: '418', name: 'Kotli Main Branch' });
  });

  it('shows "No Shift" when the real backend has no current shift and still navigates to /shift', async () => {
    getCurrentShiftMock.mockResolvedValue(null);
    const user = userEvent.setup();
    renderWithQueryClient(<Header user={{ id: '1', firstName: 'Ayesha', lastName: 'Khan', email: 'a@b.com' } as never} />);

    const pill = await screen.findByTitle('Shift management');
    expect(pill).toHaveTextContent('No Shift');

    await user.click(pill);
    expect(pushMock).toHaveBeenCalledWith('/shift');
  });

  it('shows "Shift Open" when the real backend reports an active shift', async () => {
    getCurrentShiftMock.mockResolvedValue({
      id: 'shift-1',
      tenantId: 't1',
      branchId: 'branch-1',
      cashierId: 'c1',
      openingFloat: '5000',
      closingCash: null,
      expectedCash: null,
      variance: null,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      closedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    renderWithQueryClient(<Header user={{ id: '1', firstName: 'Ayesha', lastName: 'Khan', email: 'a@b.com' } as never} />);

    const pill = await screen.findByTitle('Shift management');
    await screen.findByText('Shift Open');
    expect(pill).toHaveTextContent('Shift Open');
  });
});
