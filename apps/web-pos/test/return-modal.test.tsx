import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';

const refundSaleMock = vi.fn();
vi.mock('../lib/api', () => ({
  salesPosApi: { refundSale: (...args: unknown[]) => refundSaleMock(...args) },
}));

import { ReturnModal } from '../app/(pos)/components/return-modal';

const SALE = {
  id: 'sale-1',
  tenantId: 't1',
  branchId: 'branch-1',
  cashierId: 'cashier-1',
  shiftId: null,
  status: 'COMPLETED' as const,
  subtotal: '2000',
  discountTotal: '0',
  taxTotal: '0',
  totalAmount: '2000',
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
      quantity: 3,
      unitPrice: '500',
      lineDiscount: '0',
      lineTotal: '1500',
      refundedQuantity: 1, // one already returned previously
    },
    {
      id: 'line-2',
      saleId: 'sale-1',
      variantId: 'v2',
      productNameSnapshot: 'Boots',
      quantity: 1,
      unitPrice: '500',
      lineDiscount: '0',
      lineTotal: '500',
      refundedQuantity: 1, // fully already returned
    },
  ],
  payments: [{ id: 'pay-1', saleId: 'sale-1', method: 'CASH' as const, amount: '2000', reference: null, createdAt: '' }],
  refunds: [],
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

describe('Return modal (full/partial returns, quantity validation, duplicate prevention)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only the remaining returnable quantity per line, not the original quantity', () => {
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('2 of 3 returnable')).toBeInTheDocument();
    expect(screen.getByText('Already fully returned')).toBeInTheDocument();
  });

  it('prevents returning more than what remains, even by holding + on the stepper', async () => {
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    const increaseBtn = screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i });

    await user.click(increaseBtn);
    await user.click(increaseBtn);
    await user.click(increaseBtn); // third click attempts to exceed the 2 remaining

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(increaseBtn).toBeDisabled();
  });

  it('cannot increase quantity for a fully-already-returned line at all', () => {
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: /increase return quantity for boots/i })).toBeDisabled();
  });

  it('computes the refund amount as the pro-rated unit net price times selected quantity', async () => {
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i }));

    // unitNet = 1500 / 3 = 500 per unit; 1 unit selected -> Rs. 500.00
    expect(screen.getByText('Rs. 500.00')).toBeInTheDocument();
  });

  it('requires a reason and at least one selected quantity before submitting is possible', async () => {
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: /process return/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i }));
    expect(screen.getByRole('button', { name: /process return/i })).toBeDisabled(); // qty selected but no reason yet

    await user.type(screen.getByLabelText(/return reason/i), 'Wrong size');
    expect(screen.getByRole('button', { name: /process return/i })).toBeEnabled();
  });

  it('requires an explicit confirmation before submitting the real refund call', async () => {
    refundSaleMock.mockResolvedValue({ id: 'refund-1', saleId: 'sale-1', tenantId: 't1', branchId: 'branch-1', amount: '500', reason: 'Wrong size', processedByUserId: 'cashier-1', idempotencyKey: 'x', shiftId: null, createdAt: '' });
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i }));
    await user.type(screen.getByLabelText(/return reason/i), 'Wrong size');
    await user.click(screen.getByRole('button', { name: /process return/i }));

    expect(screen.getByText(/refund rs\. 500\.00 to the customer/i)).toBeInTheDocument();
    expect(refundSaleMock).not.toHaveBeenCalled();
  });

  it('submits only the lines with a nonzero quantity selected', async () => {
    refundSaleMock.mockResolvedValue({ id: 'refund-1', saleId: 'sale-1', tenantId: 't1', branchId: 'branch-1', amount: '500', reason: 'Wrong size', processedByUserId: 'cashier-1', idempotencyKey: 'x', shiftId: null, createdAt: '' });
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i }));
    await user.type(screen.getByLabelText(/return reason/i), 'Wrong size');
    await user.click(screen.getByRole('button', { name: /process return/i }));
    await user.click(screen.getByRole('button', { name: /confirm refund/i }));

    await waitFor(() =>
      expect(refundSaleMock).toHaveBeenCalledWith('sale-1', {
        idempotencyKey: expect.any(String),
        lines: [{ saleLineId: 'line-1', quantity: 1 }],
        reason: 'Wrong size',
      }),
    );
  });

  it('never claims success until the backend actually confirms the refund', async () => {
    refundSaleMock.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { message: 'Only 2 remaining' } } });
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i }));
    await user.type(screen.getByLabelText(/return reason/i), 'Wrong size');
    await user.click(screen.getByRole('button', { name: /process return/i }));
    await user.click(screen.getByRole('button', { name: /confirm refund/i }));

    expect(await screen.findByText('Only 2 remaining')).toBeInTheDocument();
    expect(screen.queryByText('Refund issued')).not.toBeInTheDocument();
  });

  it('calls onSuccess with the real refund record only after the backend confirms', async () => {
    const onSuccess = vi.fn();
    const refundRecord = { id: 'refund-1', saleId: 'sale-1', tenantId: 't1', branchId: 'branch-1', amount: '500', reason: 'Wrong size', processedByUserId: 'cashier-1', idempotencyKey: 'x', shiftId: null, createdAt: '' };
    refundSaleMock.mockResolvedValue(refundRecord);
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={onSuccess} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i }));
    await user.type(screen.getByLabelText(/return reason/i), 'Wrong size');
    await user.click(screen.getByRole('button', { name: /process return/i }));
    await user.click(screen.getByRole('button', { name: /confirm refund/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(refundRecord));
    expect(await screen.findByText('Refund issued')).toBeInTheDocument();
  });

  it('reuses the same idempotency key across a retry after a failed attempt (duplicate prevention)', async () => {
    refundSaleMock.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } });
    refundSaleMock.mockResolvedValueOnce({ id: 'refund-1', saleId: 'sale-1', tenantId: 't1', branchId: 'branch-1', amount: '500', reason: 'x', processedByUserId: 'cashier-1', idempotencyKey: 'x', shiftId: null, createdAt: '' });
    renderWithQueryClient(<ReturnModal sale={SALE} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /increase return quantity for men's casual shoes/i }));
    await user.type(screen.getByLabelText(/return reason/i), 'x');
    await user.click(screen.getByRole('button', { name: /process return/i }));
    await user.click(screen.getByRole('button', { name: /confirm refund/i }));
    await waitFor(() => expect(refundSaleMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /process return/i }));
    await user.click(screen.getByRole('button', { name: /confirm refund/i }));
    await waitFor(() => expect(refundSaleMock).toHaveBeenCalledTimes(2));

    const firstKey = refundSaleMock.mock.calls[0][1].idempotencyKey;
    const secondKey = refundSaleMock.mock.calls[1][1].idempotencyKey;
    expect(firstKey).toBe(secondKey);
  });
});
