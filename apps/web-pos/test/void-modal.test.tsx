import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';

const voidSaleMock = vi.fn();
vi.mock('../lib/api', () => ({
  salesPosApi: { voidSale: (...args: unknown[]) => voidSaleMock(...args) },
}));

import { VoidModal } from '../app/(pos)/components/void-modal';

const SALE = {
  id: 'sale-1',
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
      saleId: 'sale-1',
      variantId: 'v1',
      productNameSnapshot: "Men's Casual Shoes",
      quantity: 1,
      unitPrice: '1000',
      lineDiscount: '0',
      lineTotal: '1000',
      refundedQuantity: 0,
    },
  ],
  payments: [{ id: 'pay-1', saleId: 'sale-1', method: 'CASH' as const, amount: '1000', reference: null, createdAt: '' }],
  refunds: [],
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

describe('Void modal (mandatory reason, confirmation, never-fake-success)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the sale total and a clear warning about what voiding does', () => {
    renderWithQueryClient(<VoidModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('Rs. 1,000.00')).toBeInTheDocument();
    expect(screen.getByText(/all items are restocked and the full amount is reversed/i)).toBeInTheDocument();
  });

  it('disables submission until a reason is entered - the reason is mandatory', async () => {
    renderWithQueryClient(<VoidModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const submit = screen.getByRole('button', { name: /^void sale$/i });
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/void reason/i), 'Entered in error');
    expect(submit).toBeEnabled();
  });

  it('requires an explicit confirmation step before voiding', async () => {
    renderWithQueryClient(<VoidModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/void reason/i), 'Entered in error');
    await user.click(screen.getByRole('button', { name: /^void sale$/i }));

    expect(screen.getByText(/permanently void this rs\. 1,000\.00 sale/i)).toBeInTheDocument();
    expect(voidSaleMock).not.toHaveBeenCalled();
  });

  it('submits the real void with the exact reason text', async () => {
    voidSaleMock.mockResolvedValue({ id: 'refund-1', saleId: 'sale-1', tenantId: 't1', branchId: 'branch-1', amount: '1000', reason: 'Entered in error', processedByUserId: 'cashier-1', idempotencyKey: 'x', shiftId: null, createdAt: '' });
    renderWithQueryClient(<VoidModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/void reason/i), 'Entered in error');
    await user.click(screen.getByRole('button', { name: /^void sale$/i }));
    await user.click(screen.getByRole('button', { name: /confirm void/i }));

    await waitFor(() =>
      expect(voidSaleMock).toHaveBeenCalledWith('sale-1', { idempotencyKey: expect.any(String), reason: 'Entered in error' }),
    );
  });

  it('never shows the sale as voided until the backend actually confirms it', async () => {
    voidSaleMock.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: 'Sale is already refunded' } } });
    renderWithQueryClient(<VoidModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/void reason/i), 'Entered in error');
    await user.click(screen.getByRole('button', { name: /^void sale$/i }));
    await user.click(screen.getByRole('button', { name: /confirm void/i }));

    expect(await screen.findByText('Sale is already refunded')).toBeInTheDocument();
    expect(screen.queryByText('Sale voided')).not.toBeInTheDocument();
  });

  it('shows a real success panel with stock-restored confirmation once the backend confirms', async () => {
    voidSaleMock.mockResolvedValue({ id: 'refund-1', saleId: 'sale-1', tenantId: 't1', branchId: 'branch-1', amount: '1000', reason: 'Entered in error', processedByUserId: 'cashier-1', idempotencyKey: 'x', shiftId: null, createdAt: '' });
    renderWithQueryClient(<VoidModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/void reason/i), 'Entered in error');
    await user.click(screen.getByRole('button', { name: /^void sale$/i }));
    await user.click(screen.getByRole('button', { name: /confirm void/i }));

    expect(await screen.findByText('Sale voided')).toBeInTheDocument();
    expect(screen.getByText(/stock restored/i)).toBeInTheDocument();
  });
});
