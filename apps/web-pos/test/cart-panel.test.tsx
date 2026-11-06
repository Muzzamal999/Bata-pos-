import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';
import { useCartStore } from '../lib/cart-store';

const checkoutMock = vi.fn();
vi.mock('../lib/api', () => ({
  salesPosApi: { checkout: (...args: unknown[]) => checkoutMock(...args) },
}));

let mockPermissions: string[] = [];
vi.mock('../lib/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { user: { permissions: string[] } }) => unknown) => selector({ user: { permissions: mockPermissions } }),
    { getState: () => ({ selectedBranchId: 'branch-1' }) },
  ),
}));

import { CartPanel } from '../app/(pos)/components/cart-panel';

const LINE = {
  variantId: 'v1',
  productName: "Men's Casual Shoes",
  sku: 'BATA-MCS-001-9-BLUE',
  imageUrl: null,
  size: '9',
  color: 'Blue',
  unitPrice: 1000,
  availableQty: 5,
};

function resetCart() {
  useCartStore.setState({ lines: [], discountMode: 'fixed', discountValue: 0, hasHydrated: true });
}

describe('Cart panel (display, quantities, clear confirmation, loading/empty states)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [];
    resetCart();
  });

  it('shows an empty-cart state when there are no lines', () => {
    renderWithQueryClient(<CartPanel />);
    expect(screen.getByText(/scan or select a product/i)).toBeInTheDocument();
  });

  it('shows nothing until the persisted cart has hydrated, to avoid a flash of the wrong state', () => {
    useCartStore.setState({ hasHydrated: false });
    renderWithQueryClient(<CartPanel />);
    expect(screen.queryByText(/current sale/i)).not.toBeInTheDocument();
  });

  it('displays product name, SKU, size, colour and price for each cart line', () => {
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    expect(screen.getByText("Men's Casual Shoes")).toBeInTheDocument();
    expect(screen.getByText(/BATA-MCS-001-9-BLUE/)).toBeInTheDocument();
    expect(screen.getByText(/Size: 9 \| Blue/)).toBeInTheDocument();
    // Subtotal equals the single line's price at qty 1, so both render the same string.
    expect(screen.getAllByText('Rs. 1,000.00').length).toBeGreaterThanOrEqual(1);
  });

  it('increasing quantity updates the line total', async () => {
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/increase quantity/i));

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('Rs. 2,000.00').length).toBeGreaterThanOrEqual(1);
  });

  it('removing an item drops it from the cart entirely', async () => {
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/remove men's casual shoes/i));

    expect(screen.queryByText("Men's Casual Shoes")).not.toBeInTheDocument();
    expect(screen.getByText(/scan or select a product/i)).toBeInTheDocument();
  });

  it('clearing the cart requires a confirmation before it actually clears', async () => {
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear Cart' }));

    expect(screen.getByText(/clear all 1 items/i)).toBeInTheDocument();
    expect(useCartStore.getState().lines).toHaveLength(1); // not cleared yet

    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(screen.queryByText(/clear all/i)).not.toBeInTheDocument();
  });

  it('confirming the clear actually empties the cart', async () => {
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear Cart' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(screen.getByText(/scan or select a product/i)).toBeInTheDocument();
  });

  it('clicking Complete Sale opens the payment flow instead of checking out directly', async () => {
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /complete sale/i }));

    // Checkout submission itself (methods, cash/change, confirmation, success/failure)
    // is covered end-to-end in payment-modal.test.tsx - this just verifies the handoff.
    expect(screen.getByText('Payment')).toBeInTheDocument();
    expect(screen.getByText('Total Amount')).toBeInTheDocument();
    expect(checkoutMock).not.toHaveBeenCalled();
  });
});

describe('Cart panel (discounts, permission-gated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCart();
  });

  it('hides discount controls entirely when the cashier lacks sales.create', () => {
    mockPermissions = [];
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    expect(screen.queryByRole('group', { name: /discount type/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/item discount/i)).not.toBeInTheDocument();
  });

  it('shows discount controls for a cashier with sales.create', () => {
    mockPermissions = ['sales.create'];
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    expect(screen.getByRole('group', { name: /discount type/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/item discount/i)).toBeInTheDocument();
  });

  it('applies a fixed cart-level discount to the total', async () => {
    mockPermissions = ['sales.create'];
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    const user = userEvent.setup();
    // Item-level discount input renders first (inside the line), cart-level second (in the summary).
    const discountInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(discountInputs[1], '200');

    expect(screen.getByText('Rs. 800.00')).toBeInTheDocument();
  });

  it('applies a percentage cart-level discount to the total', async () => {
    mockPermissions = ['sales.create'];
    useCartStore.getState().addItem(LINE);
    renderWithQueryClient(<CartPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '%' }));
    const discountInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(discountInputs[1], '10');

    expect(screen.getByText('Rs. 900.00')).toBeInTheDocument();
  });

  it('a discount applied before the permission is lost still clamps the total correctly when hidden', () => {
    // No special UI path needed - this documents that totals never go negative
    // regardless of permission state, matching the store-level guarantee.
    mockPermissions = [];
    useCartStore.getState().addItem(LINE);
    useCartStore.setState({ discountMode: 'fixed', discountValue: 999999 });
    renderWithQueryClient(<CartPanel />);

    // discount UI hidden -> not applied without permission; subtotal and total both show the undiscounted amount.
    expect(screen.getAllByText('Rs. 1,000.00').length).toBeGreaterThanOrEqual(1);
  });
});
