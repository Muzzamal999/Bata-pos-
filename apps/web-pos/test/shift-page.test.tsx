import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';

const getCurrentShiftMock = vi.fn();
const openShiftMock = vi.fn();
const closeShiftMock = vi.fn();
const recordCashMovementMock = vi.fn();
const getBranchMock = vi.fn();
vi.mock('../lib/api', () => ({
  salesPosApi: {
    getCurrentShift: (...args: unknown[]) => getCurrentShiftMock(...args),
    openShift: (...args: unknown[]) => openShiftMock(...args),
    closeShift: (...args: unknown[]) => closeShiftMock(...args),
    recordCashMovement: (...args: unknown[]) => recordCashMovementMock(...args),
  },
  identityApi: { getBranch: (...args: unknown[]) => getBranchMock(...args) },
}));

let mockPermissions: string[] = ['shifts.open', 'shifts.close', 'shifts.read'];
vi.mock('../lib/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { user: { permissions: string[] }; selectedBranchId: string }) => unknown) =>
      selector({ user: { permissions: mockPermissions }, selectedBranchId: 'branch-1' }),
    { getState: () => ({ selectedBranchId: 'branch-1' }) },
  ),
}));

import ShiftPage from '../app/(pos)/shift/page';

const OPEN_SHIFT = {
  id: 'shift-1',
  tenantId: 't1',
  branchId: 'branch-1',
  cashierId: 'cashier-1',
  openingFloat: '5000',
  closingCash: null,
  expectedCash: null,
  variance: null,
  status: 'OPEN' as const,
  openedAt: new Date(Date.now() - 65 * 60_000).toISOString(), // opened 1h05m ago
  closedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Shift page (opening, duplicate prevention, permissions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = ['shifts.open', 'shifts.close', 'shifts.read'];
    getBranchMock.mockResolvedValue({ id: 'branch-1', code: '418', name: 'Kotli Main Branch', address: null, tenantId: 't1', isActive: true, createdAt: '', updatedAt: '' });
  });

  it('shows the opening form with the real branch when there is no active shift', async () => {
    getCurrentShiftMock.mockResolvedValue(null);
    renderWithQueryClient(<ShiftPage />);

    expect(await screen.findByRole('heading', { name: 'Open Shift' })).toBeInTheDocument();
    expect(await screen.findByText('418 - Kotli Main Branch')).toBeInTheDocument();
  });

  it('opens a real shift with the entered float', async () => {
    getCurrentShiftMock.mockResolvedValue(null);
    openShiftMock.mockResolvedValue({ ...OPEN_SHIFT, openingFloat: '2000' });
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Open Shift' });
    await user.type(screen.getByLabelText(/opening cash float/i), '2000');
    await user.click(screen.getByRole('button', { name: /^open shift$/i }));

    await waitFor(() => expect(openShiftMock).toHaveBeenCalledWith({ branchId: 'branch-1', openingFloat: 2000 }));
  });

  it('shows a clear message when the backend blocks a duplicate active shift (409)', async () => {
    getCurrentShiftMock.mockResolvedValue(null);
    openShiftMock.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: 'You already have an open shift' } } });
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Open Shift' });
    await user.type(screen.getByLabelText(/opening cash float/i), '2000');
    await user.click(screen.getByRole('button', { name: /^open shift$/i }));

    expect(await screen.findByText(/you already have an open shift/i)).toBeInTheDocument();
  });

  it('disables the Open Shift button while the request is in flight (prevents a concurrent duplicate submit)', async () => {
    getCurrentShiftMock.mockResolvedValue(null);
    let resolveOpen: (v: unknown) => void = () => {};
    openShiftMock.mockReturnValue(new Promise((resolve) => { resolveOpen = resolve; }));
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Open Shift' });
    await user.type(screen.getByLabelText(/opening cash float/i), '2000');
    await user.click(screen.getByRole('button', { name: /^open shift$/i }));

    expect(await screen.findByRole('button', { name: /opening…/i })).toBeDisabled();
    resolveOpen(OPEN_SHIFT);
    await waitFor(() => expect(openShiftMock).toHaveBeenCalledTimes(1));
  });

  it("disables shift actions without the real shifts.open permission, even though shifts.read is present", async () => {
    mockPermissions = ['shifts.read'];
    getCurrentShiftMock.mockResolvedValue(null);
    renderWithQueryClient(<ShiftPage />);

    await screen.findByRole('heading', { name: 'Open Shift' });
    expect(screen.getByRole('button', { name: /^open shift$/i })).toBeDisabled();
  });

  it("shows a permission message instead of any shift UI without shifts.read at all", async () => {
    mockPermissions = [];
    getCurrentShiftMock.mockResolvedValue(null);
    renderWithQueryClient(<ShiftPage />);

    expect(await screen.findByText(/doesn't have permission to manage shifts/i)).toBeInTheDocument();
    expect(screen.queryByText('Open Shift')).not.toBeInTheDocument();
  });
});

describe('Shift page (active dashboard, cash in/out, card/wallet separation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = ['shifts.open', 'shifts.close', 'shifts.read'];
    getBranchMock.mockResolvedValue({ id: 'branch-1', code: '418', name: 'Kotli Main Branch', address: null, tenantId: 't1', isActive: true, createdAt: '', updatedAt: '' });
    getCurrentShiftMock.mockResolvedValue(OPEN_SHIFT);
  });

  it('never shows a negative duration for a shift that was just opened (regression: `now` captured before the shift existed)', async () => {
    getCurrentShiftMock.mockResolvedValue({ ...OPEN_SHIFT, openedAt: new Date().toISOString() });
    renderWithQueryClient(<ShiftPage />);
    await screen.findByRole('heading', { name: 'Active Shift' });
    expect(screen.getByText(/duration 0h 0m/i)).toBeInTheDocument();
  });

  it('shows the real opening float and an honest disclosure that live sales totals are not available', async () => {
    renderWithQueryClient(<ShiftPage />);
    await screen.findByRole('heading', { name: 'Active Shift' });
    // Opening Float and Running Drawer Estimate both legitimately read PKR 5,000.00 while no
    // movements have been recorded yet - assert the count rather than a single ambiguous match.
    expect(screen.getAllByText('PKR 5,000.00')).toHaveLength(2);
    expect(screen.getByText(/no live sales breakdown endpoint/i)).toBeInTheDocument();
  });

  it("the running drawer estimate is only opening float plus cash in/out - never inflated by card or wallet sales (which this screen cannot see)", async () => {
    recordCashMovementMock.mockResolvedValue({ id: 'm1', shiftId: 'shift-1', type: 'CASH_IN', amount: '300', reason: 'Top-up', createdAt: new Date().toISOString() });
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Active Shift' });
    await user.click(screen.getByRole('button', { name: /cash in \/ cash out/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/^amount$/i), '300');
    await user.type(dialog.getByLabelText(/reason/i), 'Top-up');
    await user.click(dialog.getByRole('button', { name: /record cash in/i }));

    // 5000 opening + 300 cash-in = 5300, regardless of any card/wallet sales that may have happened.
    expect(await screen.findByText('PKR 5,300.00')).toBeInTheDocument();
  });

  it('requires a reason before a cash movement can be submitted', async () => {
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Active Shift' });
    await user.click(screen.getByRole('button', { name: /cash in \/ cash out/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/^amount$/i), '300');

    expect(dialog.getByRole('button', { name: /record cash in/i })).toBeDisabled();
  });

  it('records a real cash-out and reflects it in the session history and drawer estimate', async () => {
    recordCashMovementMock.mockResolvedValue({ id: 'm2', shiftId: 'shift-1', type: 'CASH_OUT', amount: '200', reason: 'Bank drop', createdAt: new Date().toISOString() });
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Active Shift' });
    await user.click(screen.getByRole('button', { name: /cash in \/ cash out/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('radio', { name: 'Cash Out' }));
    await user.type(dialog.getByLabelText(/^amount$/i), '200');
    await user.type(dialog.getByLabelText(/reason/i), 'Bank drop');
    await user.click(dialog.getByRole('button', { name: /record cash out/i }));

    expect(await screen.findByText(/bank drop/i)).toBeInTheDocument();
    expect(await screen.findByText('PKR 4,800.00')).toBeInTheDocument(); // 5000 - 200
  });
});

describe('Shift page (closing, discrepancy calculation, API failure handling)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = ['shifts.open', 'shifts.close', 'shifts.read'];
    getBranchMock.mockResolvedValue({ id: 'branch-1', code: '418', name: 'Kotli Main Branch', address: null, tenantId: 't1', isActive: true, createdAt: '', updatedAt: '' });
    getCurrentShiftMock.mockResolvedValue(OPEN_SHIFT);
  });

  it('requires an explicit confirmation before closing', async () => {
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Active Shift' });
    await user.click(screen.getByRole('button', { name: /^close shift$/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/counted cash/i), '4900');
    await user.click(dialog.getByRole('button', { name: /^close shift$/i }));

    expect(dialog.getByText(/this cannot be undone/i)).toBeInTheDocument();
    expect(closeShiftMock).not.toHaveBeenCalled();
  });

  it('shows a short/over discrepancy correctly from the real server-calculated variance', async () => {
    closeShiftMock.mockResolvedValue({ ...OPEN_SHIFT, status: 'CLOSED', closingCash: '4900', expectedCash: '5000', variance: '-100', closedAt: new Date().toISOString() });
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Active Shift' });
    await user.click(screen.getByRole('button', { name: /^close shift$/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/counted cash/i), '4900');
    await user.click(dialog.getByRole('button', { name: /^close shift$/i }));
    await user.click(dialog.getByRole('button', { name: /confirm close/i }));

    expect(await screen.findByText('Shift Report')).toBeInTheDocument();
    expect(screen.getByText(/PKR 100\.00 \(short\)/i)).toBeInTheDocument();
  });

  it('never shows the shift as closed until the backend actually confirms it', async () => {
    closeShiftMock.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: 'Shift is already closed' } } });
    renderWithQueryClient(<ShiftPage />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Active Shift' });
    await user.click(screen.getByRole('button', { name: /^close shift$/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/counted cash/i), '4900');
    await user.click(dialog.getByRole('button', { name: /^close shift$/i }));
    await user.click(dialog.getByRole('button', { name: /confirm close/i }));

    expect(await screen.findByText('Shift is already closed')).toBeInTheDocument();
    expect(screen.queryByText('Shift Report')).not.toBeInTheDocument();
  });
});
