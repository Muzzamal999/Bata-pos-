import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';

const checkoutMock = vi.fn();
vi.mock('../lib/api', () => ({
  salesPosApi: { checkout: (...args: unknown[]) => checkoutMock(...args) },
}));

vi.mock('../lib/auth-store', () => ({
  useAuthStore: { getState: () => ({ selectedBranchId: 'branch-1' }) },
}));

import { PaymentModal } from '../app/(pos)/components/payment-modal';

const LINE = {
  variantId: 'v1',
  productName: "Men's Casual Shoes",
  sku: 'BATA-MCS-001-9-BLUE',
  imageUrl: null,
  size: '9',
  color: 'Blue',
  unitPrice: 1000,
  quantity: 1,
  availableQty: 5,
  lineDiscount: 0,
};

function renderModal(overrides: Partial<Parameters<typeof PaymentModal>[0]> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  renderWithQueryClient(
    <PaymentModal lines={[LINE]} discountTotal={0} total={1000} onClose={onClose} onSuccess={onSuccess} {...overrides} />,
  );
  return { onClose, onSuccess };
}

describe('Payment modal (methods, cash + change, confirmation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only the backend-supported payment methods: Cash, Card, Mobile Wallet', () => {
    renderModal();
    expect(screen.getByRole('radio', { name: 'Cash' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Card' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mobile Wallet' })).toBeInTheDocument();
  });

  it('computes exact change for an exact cash payment', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');

    expect(screen.getByText('Change due')).toBeInTheDocument();
    expect(screen.getByText('Rs. 0.00')).toBeInTheDocument();
  });

  it('computes change when cash received exceeds the total', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1500');

    expect(screen.getByText('Rs. 500.00')).toBeInTheDocument();
  });

  it('flags insufficient cash and disables Complete Payment', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '500');

    expect(screen.getByText(/insufficient payment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete payment/i })).toBeDisabled();
  });

  it('non-cash methods do not require a received-amount field and are immediately confirmable', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Card' }));

    expect(screen.queryByLabelText(/cash received/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete payment/i })).toBeEnabled();
  });

  it('requires an explicit confirmation step before submitting the sale', async () => {
    checkoutMock.mockResolvedValue({ id: 'sale-123' });
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));

    expect(screen.getByText(/confirm payment of rs\. 1,000\.00 via cash/i)).toBeInTheDocument();
    expect(checkoutMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(checkoutMock).toHaveBeenCalledTimes(1));
  });

  it('cancelling the confirmation does not submit', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(checkoutMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /complete payment/i })).toBeInTheDocument();
  });
});

describe('Payment modal (submission, success, failure, idempotency)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits the real checkout payload with the correct cash payment amount', async () => {
    checkoutMock.mockResolvedValue({ id: 'sale-123' });
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(checkoutMock).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-1',
          lines: [{ variantId: 'v1', quantity: 1 }],
          payments: [{ method: 'CASH', amount: 1000 }],
          discountTotal: 0,
        }),
      ),
    );
  });

  it('shows a success panel with the sale id and change due after a real checkout', async () => {
    checkoutMock.mockResolvedValue({ id: 'sale-abc12345' });
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1500');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Sale completed')).toBeInTheDocument();
    expect(screen.getByText(/sale-abc/)).toBeInTheDocument();
    expect(screen.getByText(/change due: rs\. 500\.00/i)).toBeInTheDocument();
  });

  it('calls onSuccess once checkout actually succeeds', async () => {
    checkoutMock.mockResolvedValue({ id: 'sale-123' });
    const { onSuccess } = renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('sale-123'));
  });

  it('shows a clear error and never fakes success when checkout fails', async () => {
    checkoutMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: 'Insufficient stock for this operation' } },
    });
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Insufficient stock for this operation')).toBeInTheDocument();
    expect(screen.queryByText('Sale completed')).not.toBeInTheDocument();
  });

  it('reuses the same idempotency key across a retry after a failed attempt', async () => {
    checkoutMock.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } });
    checkoutMock.mockResolvedValueOnce({ id: 'sale-123' });
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(checkoutMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(checkoutMock).toHaveBeenCalledTimes(2));

    const firstKey = checkoutMock.mock.calls[0][0].idempotencyKey;
    const secondKey = checkoutMock.mock.calls[1][0].idempotencyKey;
    expect(firstKey).toBe(secondKey);
  });

  it('disables Complete Payment while a submission is in flight, preventing duplicate submits', async () => {
    let resolveCheckout: (v: { id: string }) => void = () => {};
    checkoutMock.mockReturnValue(new Promise((resolve) => { resolveCheckout = resolve; }));
    renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cash received/i), '1000');
    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('button', { name: /processing/i })).toBeDisabled();
    resolveCheckout({ id: 'sale-123' });
  });
});

describe('Payment modal (split payment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds up multiple payment lines and only allows confirming once fully covered', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /split across multiple/i }));

    const amountInput = screen.getByPlaceholderText(/up to/i);
    await user.type(amountInput, '400');
    await user.click(screen.getByRole('button', { name: /add cash/i }));

    expect(screen.getByText(/cash — rs\. 400\.00/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete payment/i })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Card' }));
    await user.type(screen.getByPlaceholderText(/up to/i), '600');
    await user.click(screen.getByRole('button', { name: /add card/i }));

    expect(screen.getByRole('button', { name: /complete payment/i })).toBeEnabled();
  });

  it('rejects an invalid split amount (exceeding what remains) by disabling Add', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /split across multiple/i }));

    await user.type(screen.getByPlaceholderText(/up to/i), '99999');
    expect(screen.getByRole('button', { name: /add cash/i })).toBeDisabled();
  });

  it('submits all split payment lines on confirm', async () => {
    checkoutMock.mockResolvedValue({ id: 'sale-123' });
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /split across multiple/i }));
    await user.type(screen.getByPlaceholderText(/up to/i), '400');
    await user.click(screen.getByRole('button', { name: /add cash/i }));
    await user.click(screen.getByRole('radio', { name: 'Card' }));
    await user.type(screen.getByPlaceholderText(/up to/i), '600');
    await user.click(screen.getByRole('button', { name: /add card/i }));

    await user.click(screen.getByRole('button', { name: /complete payment/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(checkoutMock).toHaveBeenCalledWith(
        expect.objectContaining({
          payments: [
            { method: 'CASH', amount: 400 },
            { method: 'CARD', amount: 600 },
          ],
        }),
      ),
    );
  });
});
