import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Receipt } from '../app/(pos)/components/receipt';

const SALE = {
  id: 'sale-abc12345-full-uuid',
  tenantId: 't1',
  branchId: 'branch-1',
  cashierId: 'cashier-1',
  shiftId: null,
  status: 'COMPLETED' as const,
  subtotal: '10000',
  discountTotal: '500',
  taxTotal: '0',
  totalAmount: '9500',
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
      unitPrice: '7499',
      lineDiscount: '0',
      lineTotal: '7499',
      refundedQuantity: 0,
    },
    {
      id: 'line-2',
      saleId: 'sale-abc12345-full-uuid',
      variantId: 'v2',
      productNameSnapshot: 'Boots',
      quantity: 1,
      unitPrice: '3001',
      lineDiscount: '500',
      lineTotal: '2501',
      refundedQuantity: 0,
    },
  ],
  payments: [
    {
      id: 'pay-1',
      saleId: 'sale-abc12345-full-uuid',
      method: 'CASH' as const,
      amount: '9500',
      reference: null,
      createdAt: '2026-11-06T10:00:00.000Z',
    },
  ],
  refunds: [],
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

const BRANCH = {
  id: 'branch-1',
  tenantId: 't1',
  name: 'Kotli Main Branch',
  code: '418',
  address: 'Kotli, AJK',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

describe('Receipt (data accuracy)', () => {
  it('renders real sale data: store, order id, date, cashier, every line, subtotal, discount, total, payment', () => {
    render(
      <Receipt sale={SALE} branch={BRANCH} cashierName="Ayesha Khan" layout="a4" />,
    );

    expect(screen.getByText('Kotli Main Branch')).toBeInTheDocument();
    expect(screen.getByText(/branch #418/i)).toBeInTheDocument();
    expect(screen.getByText(/receipt #sale-abc/i)).toBeInTheDocument();
    expect(screen.getByText('sale-abc12345-full-uuid')).toBeInTheDocument();
    expect(screen.getByText('Ayesha Khan')).toBeInTheDocument();
    expect(screen.getByText("Men's Casual Shoes")).toBeInTheDocument();
    expect(screen.getByText('Boots')).toBeInTheDocument();
    expect(screen.getByText('Rs. 10,000.00')).toBeInTheDocument(); // subtotal
    // The cart-level discount row and line-2's own item discount both happen to be Rs. 500.00 here.
    expect(screen.getAllByText('-Rs. 500.00').length).toBe(2);
    // Total and the single CASH payment both legitimately show the same amount here.
    expect(screen.getAllByText('Rs. 9,500.00').length).toBe(2);
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Thank you for shopping with BATA!')).toBeInTheDocument();
  });

  it('shows the item-level discount on the specific line that has one', () => {
    render(<Receipt sale={SALE} branch={null} cashierName={null} layout="a4" />);
    // line-2 has a 500 item discount, shown alongside its qty x price row.
    expect(screen.getByText('1 × Rs. 3,001.00')).toBeInTheDocument();
  });

  it('omits the tax row when taxTotal is zero, and shows it when non-zero', () => {
    const { rerender } = render(<Receipt sale={SALE} branch={null} cashierName={null} layout="a4" />);
    expect(screen.queryByText('Tax')).not.toBeInTheDocument();

    rerender(<Receipt sale={{ ...SALE, taxTotal: '150' }} branch={null} cashierName={null} layout="a4" />);
    expect(screen.getByText('Tax')).toBeInTheDocument();
    expect(screen.getByText('Rs. 150.00')).toBeInTheDocument();
  });

  it('shows cash received and change when provided for a cash sale', () => {
    render(<Receipt sale={SALE} branch={null} cashierName={null} layout="a4" cashReceived={10000} />);
    expect(screen.getByText('Cash received')).toBeInTheDocument();
    // Subtotal and cash received both legitimately show Rs. 10,000.00 here.
    expect(screen.getAllByText('Rs. 10,000.00').length).toBe(2);
    expect(screen.getByText('Change')).toBeInTheDocument();
    expect(screen.getByText('Rs. 500.00')).toBeInTheDocument();
  });

  it('enriches a line with SKU/size/colour only when that detail is actually available (fresh checkout), never fabricated', () => {
    render(
      <Receipt
        sale={SALE}
        branch={null}
        cashierName={null}
        layout="a4"
        lineDetails={{ v1: { sku: 'BATA-MCS-001-9-BLUE', size: '9', color: 'Blue' } }}
      />,
    );
    expect(screen.getByText(/SKU BATA-MCS-001-9-BLUE/)).toBeInTheDocument();
    // v2 (Boots) has no lineDetails entry, so exactly one SKU row should render, not two.
    expect(screen.getAllByText(/^SKU /)).toHaveLength(1);
  });

  it('does not break on a very long product name', () => {
    const longName = 'A'.repeat(120);
    const sale = { ...SALE, lines: [{ ...SALE.lines[0], productNameSnapshot: longName }] };
    render(<Receipt sale={sale} branch={null} cashierName={null} layout="58mm" />);
    expect(screen.getByText(longName)).toBeInTheDocument();
  });
});

describe('Receipt (layout widths)', () => {
  it.each(['a4', '80mm', '58mm'] as const)('renders without error in %s layout', (layout) => {
    render(<Receipt sale={SALE} branch={BRANCH} cashierName={null} layout={layout} />);
    expect(screen.getByText('Payment Receipt')).toBeInTheDocument();
  });
});
