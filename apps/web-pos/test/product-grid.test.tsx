import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from './test-utils';

const lookupByBarcodeMock = vi.fn();
vi.mock('../lib/api', () => ({
  salesPosApi: { lookupByBarcode: (...args: unknown[]) => lookupByBarcodeMock(...args) },
  productInventoryApi: { getVariant: vi.fn() },
}));

vi.mock('../lib/auth-store', () => ({
  useAuthStore: (selector: (s: { selectedBranchId: string | null }) => unknown) =>
    selector({ selectedBranchId: 'branch-1' }),
}));

const addItemMock = vi.fn(() => true);
vi.mock('../lib/cart-store', () => ({
  useCartStore: (selector: (s: { addItem: typeof addItemMock }) => unknown) => selector({ addItem: addItemMock }),
}));

const useCategoriesMock = vi.fn();
const useProductsMock = vi.fn();
const useVariantsForProductsMock = vi.fn();
const usePricesBulkMock = vi.fn();
const useBranchBalancesMock = vi.fn();
vi.mock('../lib/catalog', async () => {
  const actual = await vi.importActual<typeof import('../lib/catalog')>('../lib/catalog');
  return {
    ...actual,
    useCategories: () => useCategoriesMock(),
    useProducts: (...args: unknown[]) => useProductsMock(...args),
    useVariantsForProducts: (...args: unknown[]) => useVariantsForProductsMock(...args),
    usePricesBulk: () => usePricesBulkMock(),
    useBranchBalances: () => useBranchBalancesMock(),
  };
});

import { ProductGrid } from '../app/(pos)/components/product-grid';

const MEN_CASUAL = {
  id: 'p1',
  tenantId: 't1',
  articleNumber: 'BATA-MCS-001',
  name: "Men's Casual Shoes",
  description: null,
  brandId: null,
  categoryId: 'cat-men',
  metadata: null,
  isActive: true,
  createdAt: '',
  updatedAt: '',
  brand: null,
  category: { id: 'cat-men', tenantId: 't1', name: 'Men', isActive: true, createdAt: '', updatedAt: '' },
  images: [],
};

const SINGLE_VARIANT = {
  id: 'v1',
  tenantId: 't1',
  productId: 'p1',
  size: '9',
  color: 'Blue',
  sku: 'BATA-MCS-001-9-BLUE',
  isActive: true,
  barcodes: [{ id: 'b1', variantId: 'v1', code: '1234567890123', createdAt: '' }],
  createdAt: '',
  updatedAt: '',
};

const TWO_VARIANTS = [
  SINGLE_VARIANT,
  { ...SINGLE_VARIANT, id: 'v2', size: '10', color: 'Black', sku: 'BATA-MCS-001-10-BLACK', barcodes: [] },
];

const PRICE_V1 = { id: 'pr1', tenantId: 't1', productId: null, variantId: 'v1', branchId: null, amount: '7499', currency: 'PKR', effectiveFrom: '', effectiveTo: null, createdAt: '', updatedAt: '' };
const BALANCE_V1 = { id: 'bal1', tenantId: 't1', locationId: 'branch-1', variantId: 'v1', onHandQty: 10, reservedQty: 0, availableQty: 10, lowStockThreshold: null, createdAt: '', updatedAt: '' };

function setupDefaults({
  products = [MEN_CASUAL],
  variantsByProduct = new Map([['p1', [SINGLE_VARIANT]]]),
  prices = [PRICE_V1],
  balances = [BALANCE_V1],
  productsLoading = false,
  productsError = null as unknown,
} = {}) {
  useCategoriesMock.mockReturnValue({ data: { data: [MEN_CASUAL.category], total: 1, page: 1, limit: 100 } });
  useProductsMock.mockReturnValue({
    data: productsError ? undefined : { data: products, total: products.length, page: 1, limit: 12 },
    isLoading: productsLoading,
    error: productsError,
  });
  useVariantsForProductsMock.mockReturnValue({ byProductId: variantsByProduct, isLoading: false });
  usePricesBulkMock.mockReturnValue({ data: { data: prices, total: prices.length, page: 1, limit: 100 } });
  useBranchBalancesMock.mockReturnValue({ data: { data: balances, total: balances.length, page: 1, limit: 100 } });
}

describe('Product catalogue (grid, search, barcode scan, variant selection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addItemMock.mockReturnValue(true);
  });

  it('loads and displays the real product catalogue with name, article number, category and price', () => {
    setupDefaults();
    renderWithQueryClient(<ProductGrid />);

    expect(screen.getByText("Men's Casual Shoes")).toBeInTheDocument();
    expect(screen.getByText(/BATA-MCS-001/)).toBeInTheDocument();
    expect(screen.getByText(/BATA-MCS-001/)).toHaveTextContent('Men');
    expect(screen.getByText('Rs. 7,499')).toBeInTheDocument();
  });

  it('shows a loading state while the catalogue is being fetched', () => {
    setupDefaults({ productsLoading: true });
    renderWithQueryClient(<ProductGrid />);
    expect(screen.getByText(/loading products/i)).toBeInTheDocument();
  });

  it('shows an empty-results state when a search matches nothing', () => {
    setupDefaults({ products: [] });
    renderWithQueryClient(<ProductGrid />);
    expect(screen.getByText(/no products match/i)).toBeInTheDocument();
  });

  it('surfaces an API error instead of a blank screen when the catalogue fails to load', () => {
    setupDefaults({
      productsError: { isAxiosError: true, response: undefined },
    });
    renderWithQueryClient(<ProductGrid />);
    expect(screen.getByText(/cannot reach the product & inventory service/i)).toBeInTheDocument();
  });

  it('searches by product name or SKU/article number via the real query param', async () => {
    setupDefaults();
    renderWithQueryClient(<ProductGrid />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search products/i), 'BATA-MCS-001');

    await waitFor(() =>
      expect(useProductsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'BATA-MCS-001' }),
      ),
    );
  });

  it('looks up a scanned barcode against the real catalog and adds the matched variant to the cart', async () => {
    setupDefaults();
    lookupByBarcodeMock.mockResolvedValue({
      found: true,
      entry: { variantId: 'v1', productId: 'p1', productName: "Men's Casual Shoes", price: '7499', currency: 'PKR' },
    });
    const { productInventoryApi } = await import('../lib/api');
    (productInventoryApi.getVariant as ReturnType<typeof vi.fn>).mockResolvedValue(SINGLE_VARIANT);

    renderWithQueryClient(<ProductGrid />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/search products/i);
    await user.type(input, '1234567890123{Enter}');

    await waitFor(() => expect(lookupByBarcodeMock).toHaveBeenCalledWith('1234567890123'));
    await waitFor(() => expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: 'v1', size: '9', color: 'Blue', unitPrice: 7499, availableQty: 10 }),
    ));
  });

  it('shows a clear error for an unknown barcode and does not add anything to the cart', async () => {
    setupDefaults();
    lookupByBarcodeMock.mockResolvedValue({ found: false });

    renderWithQueryClient(<ProductGrid />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search products/i), '9999999999999{Enter}');

    expect(await screen.findByText(/unknown barcode: 9999999999999/i)).toBeInTheDocument();
    expect(addItemMock).not.toHaveBeenCalled();
  });

  it('adds a single-variant product directly to the cart on click, with real size/colour/price', async () => {
    setupDefaults();
    renderWithQueryClient(<ProductGrid />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Men's Casual Shoes"));

    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: 'v1', size: '9', color: 'Blue', unitPrice: 7499, availableQty: 10 }),
    );
  });

  it('opens a variant picker for a multi-variant product instead of guessing which one to add', async () => {
    setupDefaults({ variantsByProduct: new Map([['p1', TWO_VARIANTS]]) });
    renderWithQueryClient(<ProductGrid />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Men's Casual Shoes"));

    expect(await screen.findByText(/select size & colour/i)).toBeInTheDocument();
    expect(screen.getByText(/size 9 · blue/i)).toBeInTheDocument();
    expect(screen.getByText(/size 10 · black/i)).toBeInTheDocument();
    expect(addItemMock).not.toHaveBeenCalled();
  });

  it('blocks adding an out-of-stock variant at this branch', async () => {
    setupDefaults({ balances: [{ ...BALANCE_V1, availableQty: 0 }] });
    renderWithQueryClient(<ProductGrid />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Men's Casual Shoes"));

    expect(await screen.findByRole('alert')).toHaveTextContent(/out of stock at this branch/i);
    expect(addItemMock).not.toHaveBeenCalled();
  });
});
