import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';

const getSaleMock = vi.fn();
const getBranchMock = vi.fn();
const refundSaleMock = vi.fn();
const voidSaleMock = vi.fn();
vi.mock('../lib/api', () => ({
  salesPosApi: {
    getSale: (...args: unknown[]) => getSaleMock(...args),
    refundSale: (...args: unknown[]) => refundSaleMock(...args),
    voidSale: (...args: unknown[]) => voidSaleMock(...args),
  },
  identityApi: { getBranch: (...args: unknown[]) => getBranchMock(...args) },
}));

vi.mock('../lib/use-current-user', () => ({
  useCurrentUser: () => ({ data: { id: 'cashier-1', firstName: 'Ayesha', lastName: 'Khan', email: 'a@b.com' } }),
}));

let mockPermissions: string[] = [];
vi.mock('../lib/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { permissions: string[] } }) => unknown) =>
    selector({ user: { permissions: mockPermissions } }),
}));

import ReprintPage from '../app/(pos)/reprint/page';

const SALE = {
  id: 'sale-abc12345-full-uuid',
  tenantId: 't1',
  branchId: 'branch-1',
  cashierId: 'cashier-1',
  shiftId: null,
  status: 'COMPLETED' as const,
  subtotal: '1000',
  discountTotal: '0',
  taxTotal: '0',
  totalAmount: '1000',
  currency: 'Rs.',
  refundedAmount: '0',
  refundedAt: null,
  idempotencyKey: 'idem-1',
  lines: [
    {
      id: 'line-1',
      saleId: 'sale-abc12345-full-uuid',
      variantId: 'v1',
      productNameSnapshot: "Men's Casual Shoes",
      quantity: 2,
      unitPrice: '500',
      lineDiscount: '0',
      lineTotal: '1000',
      refundedQuantity: 0,
    },
  ],
  payments: [
    {
      id: 'pay-1',
      saleId: 'sale-abc12345-full-uuid',
      method: 'CASH' as const,
      amount: '1000',
      reference: null,
      createdAt: '2026-11-06T10:00:00.000Z',
    },
  ],
  refunds: [],
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

async function findSale() {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(/e\.g\./i), 'sale-abc12345-full-uuid');
  await user.click(screen.getByRole('button', { name: /find sale/i }));
  return user;
}

describe('Sale lookup page (lookup, receipt, authorized vs unauthorized)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [];
    getBranchMock.mockResolvedValue({ id: 'branch-1', code: '418', name: 'Kotli Main Branch', address: null, tenantId: 't1', isActive: true, createdAt: '', updatedAt: '' });
  });

  it('looks up a real sale by id and shows its detail', async () => {
    getSaleMock.mockResolvedValue(SALE);
    renderWithQueryClient(<ReprintPage />);
    await findSale();

    await waitFor(() => expect(getSaleMock).toHaveBeenCalledWith('sale-abc12345-full-uuid'));
    expect(await screen.findByText("Men's Casual Shoes")).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('opens the real receipt via an explicit action, not automatically', async () => {
    getSaleMock.mockResolvedValue(SALE);
    renderWithQueryClient(<ReprintPage />);
    const user = await findSale();
    await screen.findByText("Men's Casual Shoes");

    expect(screen.queryByText('Payment Receipt')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /view receipt/i }));
    expect(await screen.findByText('Payment Receipt')).toBeInTheDocument();
  });

  it("shows the current cashier's own name on the receipt when they made the sale", async () => {
    getSaleMock.mockResolvedValue(SALE);
    renderWithQueryClient(<ReprintPage />);
    const user = await findSale();
    await screen.findByText("Men's Casual Shoes");
    await user.click(screen.getByRole('button', { name: /view receipt/i }));

    expect(await screen.findByText('Ayesha Khan')).toBeInTheDocument();
  });

  it('does not fabricate a cashier name for a sale made by someone else', async () => {
    getSaleMock.mockResolvedValue({ ...SALE, cashierId: 'someone-else' });
    renderWithQueryClient(<ReprintPage />);
    const user = await findSale();
    await screen.findByText("Men's Casual Shoes");
    await user.click(screen.getByRole('button', { name: /view receipt/i }));

    await screen.findByText('Payment Receipt');
    expect(screen.queryByText('Ayesha Khan')).not.toBeInTheDocument();
  });

  it('shows a clear message for a sale that is not found or not accessible from this branch (404)', async () => {
    getSaleMock.mockRejectedValue({ isAxiosError: true, response: { status: 404, data: {} } });
    renderWithQueryClient(<ReprintPage />);
    await findSale();

    expect(await screen.findByText(/no sale found|isn't accessible/i)).toBeInTheDocument();
  });

  it('shows a clear message for an unauthorized lookup (403), never fabricated sale data', async () => {
    getSaleMock.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: {} } });
    renderWithQueryClient(<ReprintPage />);
    await findSale();

    expect(await screen.findByText(/doesn't have permission/i)).toBeInTheDocument();
    expect(screen.queryByText("Men's Casual Shoes")).not.toBeInTheDocument();
  });
});

describe('Sale lookup page (return/void eligibility, permission-gated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBranchMock.mockResolvedValue({ id: 'branch-1', code: '418', name: 'Kotli Main Branch', address: null, tenantId: 't1', isActive: true, createdAt: '', updatedAt: '' });
  });

  it('disables Process Return and Void Sale without the real permissions, even on an eligible sale', async () => {
    mockPermissions = [];
    getSaleMock.mockResolvedValue(SALE);
    renderWithQueryClient(<ReprintPage />);
    await findSale();
    await screen.findByText("Men's Casual Shoes");

    expect(screen.getByRole('button', { name: /process return/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /void sale/i })).toBeDisabled();
  });

  it('enables Process Return and Void Sale for a completed sale when the cashier has both permissions', async () => {
    mockPermissions = ['sales.refund', 'sales.void'];
    getSaleMock.mockResolvedValue(SALE);
    renderWithQueryClient(<ReprintPage />);
    await findSale();
    await screen.findByText("Men's Casual Shoes");

    expect(screen.getByRole('button', { name: /process return/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /void sale/i })).toBeEnabled();
  });

  it('disables Void Sale on a sale that already has a prior refund (PARTIALLY_REFUNDED)', async () => {
    mockPermissions = ['sales.refund', 'sales.void'];
    getSaleMock.mockResolvedValue({
      ...SALE,
      status: 'PARTIALLY_REFUNDED' as const,
      lines: [{ ...SALE.lines[0], refundedQuantity: 1 }],
    });
    renderWithQueryClient(<ReprintPage />);
    await findSale();
    await screen.findByText("Men's Casual Shoes");

    expect(screen.getByRole('button', { name: /process return/i })).toBeEnabled(); // 1 unit still returnable
    expect(screen.getByRole('button', { name: /void sale/i })).toBeDisabled();
  });

  it('disables both actions on a fully refunded sale with nothing left to return', async () => {
    mockPermissions = ['sales.refund', 'sales.void'];
    getSaleMock.mockResolvedValue({
      ...SALE,
      status: 'REFUNDED' as const,
      lines: [{ ...SALE.lines[0], refundedQuantity: 2 }],
    });
    renderWithQueryClient(<ReprintPage />);
    await findSale();
    await screen.findByText("Men's Casual Shoes");

    expect(screen.getByRole('button', { name: /process return/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /void sale/i })).toBeDisabled();
    expect(screen.getByText(/no further returns or voids/i)).toBeInTheDocument();
  });

  it('shows real refund history when present on the sale', async () => {
    mockPermissions = ['sales.refund'];
    getSaleMock.mockResolvedValue({
      ...SALE,
      status: 'PARTIALLY_REFUNDED' as const,
      lines: [{ ...SALE.lines[0], refundedQuantity: 1 }],
      refunds: [
        {
          id: 'refund-1',
          saleId: SALE.id,
          tenantId: 't1',
          branchId: 'branch-1',
          amount: '500',
          reason: 'Wrong size',
          processedByUserId: 'cashier-1',
          idempotencyKey: 'idem-r1',
          shiftId: null,
          createdAt: '2026-11-06T11:00:00.000Z',
        },
      ],
    });
    renderWithQueryClient(<ReprintPage />);
    await findSale();

    expect(await screen.findByText(/wrong size/i)).toBeInTheDocument();
  });

  it('opens the return flow and completes a real partial return', async () => {
    mockPermissions = ['sales.refund'];
    getSaleMock.mockResolvedValue(SALE);
    refundSaleMock.mockResolvedValue({
      id: 'refund-1',
      saleId: SALE.id,
      tenantId: 't1',
      branchId: 'branch-1',
      amount: '500',
      reason: 'Defective',
      processedByUserId: 'cashier-1',
      idempotencyKey: 'idem-r1',
      shiftId: null,
      createdAt: '2026-11-06T11:00:00.000Z',
    });
    renderWithQueryClient(<ReprintPage />);
    const user = await findSale();
    await screen.findByText("Men's Casual Shoes");

    await user.click(screen.getByRole('button', { name: /process return/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: /increase return quantity/i }));
    await user.type(dialog.getByLabelText(/return reason/i), 'Defective');
    await user.click(dialog.getByRole('button', { name: /^process return$/i }));
    await user.click(dialog.getByRole('button', { name: /confirm refund/i }));

    await waitFor(() =>
      expect(refundSaleMock).toHaveBeenCalledWith(
        SALE.id,
        expect.objectContaining({ lines: [{ saleLineId: 'line-1', quantity: 1 }], reason: 'Defective' }),
      ),
    );
    expect(await screen.findByText('Refund issued')).toBeInTheDocument();
  });

  it('opens the void flow and completes a real void with a mandatory reason', async () => {
    mockPermissions = ['sales.void'];
    getSaleMock.mockResolvedValue(SALE);
    voidSaleMock.mockResolvedValue({
      id: 'refund-2',
      saleId: SALE.id,
      tenantId: 't1',
      branchId: 'branch-1',
      amount: '1000',
      reason: 'Duplicate',
      processedByUserId: 'cashier-1',
      idempotencyKey: 'idem-v1',
      shiftId: null,
      createdAt: '2026-11-06T11:00:00.000Z',
    });
    renderWithQueryClient(<ReprintPage />);
    const user = await findSale();
    await screen.findByText("Men's Casual Shoes");

    await user.click(screen.getByRole('button', { name: /void sale/i }));
    const dialog = within(screen.getByRole('dialog'));
    // Void cannot proceed without a reason.
    expect(dialog.getByRole('button', { name: /^void sale$/i })).toBeDisabled();
    await user.type(dialog.getByLabelText(/void reason/i), 'Duplicate');
    await user.click(dialog.getByRole('button', { name: /^void sale$/i }));
    await user.click(dialog.getByRole('button', { name: /confirm void/i }));

    await waitFor(() =>
      expect(voidSaleMock).toHaveBeenCalledWith(SALE.id, expect.objectContaining({ reason: 'Duplicate' })),
    );
    expect(await screen.findByText('Sale voided')).toBeInTheDocument();
  });
});
