import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptModal } from '../app/(pos)/components/receipt-modal';

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
      quantity: 1,
      unitPrice: '1000',
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

describe('Receipt modal (layout toggle, print, copy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to A4 layout and allows switching to thermal widths', async () => {
    render(<ReceiptModal sale={SALE} branch={null} cashierName={null} onClose={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'A4' })).toHaveClass(/layoutButtonActive/);

    await user.click(screen.getByRole('button', { name: '80mm' }));
    expect(screen.getByRole('button', { name: '80mm' })).toHaveClass(/layoutButtonActive/);

    await user.click(screen.getByRole('button', { name: '58mm' }));
    expect(screen.getByRole('button', { name: '58mm' })).toHaveClass(/layoutButtonActive/);
  });

  it('Print button triggers the real browser print dialog', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReceiptModal sale={SALE} branch={null} cashierName={null} onClose={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^print$/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('Download PDF uses the browser print dialog (Save as PDF) - no fabricated PDF generation', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReceiptModal sale={SALE} branch={null} cashierName={null} onClose={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('copies the real sale id to the clipboard', async () => {
    // jsdom provides a real (stubbed) Clipboard object - spy on its method
    // rather than replacing navigator.clipboard, which doesn't stick here.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<ReceiptModal sale={SALE} branch={null} cashierName={null} onClose={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /copy #/i }));
    expect(writeText).toHaveBeenCalledWith('sale-abc12345-full-uuid');
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });
});
