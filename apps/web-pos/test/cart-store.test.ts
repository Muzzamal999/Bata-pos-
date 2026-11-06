import { describe, it, expect, beforeEach } from 'vitest';
import {
  useCartStore,
  cartSubtotal,
  cartLineDiscounts,
  cartDiscountAmount,
  cartGrandTotal,
  lineSubtotal,
  lineTotal,
  roundMoney,
} from '../lib/cart-store';

const LINE = {
  variantId: 'v1',
  productName: "Men's Casual Shoes",
  sku: 'BATA-MCS-001-9-BLUE',
  imageUrl: null,
  size: '9',
  color: 'Blue',
  unitPrice: 7499,
  availableQty: 2,
};

describe('Cart store (items, quantities, stock validation)', () => {
  beforeEach(() => {
    useCartStore.setState({ lines: [], discountMode: 'fixed', discountValue: 0 });
  });

  it('adds a product variant to the cart with SKU, size, colour and unit price', () => {
    const added = useCartStore.getState().addItem(LINE);
    expect(added).toBe(true);

    const [line] = useCartStore.getState().lines;
    expect(line).toMatchObject({
      variantId: 'v1',
      productName: "Men's Casual Shoes",
      sku: 'BATA-MCS-001-9-BLUE',
      size: '9',
      color: 'Blue',
      unitPrice: 7499,
      quantity: 1,
      lineDiscount: 0,
    });
  });

  it('adding the same variant again increments its quantity instead of creating a duplicate line', () => {
    useCartStore.getState().addItem(LINE);
    useCartStore.getState().addItem(LINE);

    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(useCartStore.getState().lines[0].quantity).toBe(2);
  });

  it('refuses to add past the available stock for that variant', () => {
    useCartStore.getState().addItem(LINE); // qty 1
    useCartStore.getState().addItem(LINE); // qty 2, at the cap (availableQty: 2)
    const thirdAdd = useCartStore.getState().addItem(LINE);

    expect(thirdAdd).toBe(false);
    expect(useCartStore.getState().lines[0].quantity).toBe(2);
  });

  it('incrementQty raises the quantity and reports success', () => {
    useCartStore.getState().addItem({ ...LINE, availableQty: 5 });
    const ok = useCartStore.getState().incrementQty('v1');

    expect(ok).toBe(true);
    expect(useCartStore.getState().lines[0].quantity).toBe(2);
  });

  it('incrementQty refuses once the line is already at available stock', () => {
    useCartStore.getState().addItem(LINE); // availableQty 2, qty becomes 1
    useCartStore.getState().incrementQty('v1'); // qty becomes 2, at the cap
    const blocked = useCartStore.getState().incrementQty('v1');

    expect(blocked).toBe(false);
    expect(useCartStore.getState().lines[0].quantity).toBe(2);
  });

  it('decrementQty removes the line entirely once quantity reaches zero', () => {
    useCartStore.getState().addItem(LINE);
    useCartStore.getState().decrementQty('v1');

    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('removeItem drops a line regardless of quantity', () => {
    useCartStore.getState().addItem({ ...LINE, availableQty: 5 });
    useCartStore.getState().incrementQty('v1');
    useCartStore.getState().removeItem('v1');

    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('clear() empties the cart and resets discount state', () => {
    useCartStore.getState().addItem(LINE);
    useCartStore.getState().setDiscountMode('percentage');
    useCartStore.getState().setDiscountValue(10);

    useCartStore.getState().clear();

    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(useCartStore.getState().discountMode).toBe('fixed');
    expect(useCartStore.getState().discountValue).toBe(0);
  });
});

describe('Cart store (item-level discounts)', () => {
  beforeEach(() => {
    useCartStore.setState({ lines: [], discountMode: 'fixed', discountValue: 0 });
  });

  it('applies a per-line discount, reflected in that line only', () => {
    useCartStore.getState().addItem({ ...LINE, availableQty: 5 });
    useCartStore.getState().setLineDiscount('v1', 500);

    const [line] = useCartStore.getState().lines;
    expect(line.lineDiscount).toBe(500);
    expect(lineTotal(line)).toBe(6999);
  });

  it('clamps a line discount so it can never exceed that line\'s own subtotal', () => {
    useCartStore.getState().addItem(LINE); // subtotal 7499
    useCartStore.getState().setLineDiscount('v1', 999999);

    expect(useCartStore.getState().lines[0].lineDiscount).toBe(7499);
    expect(lineTotal(useCartStore.getState().lines[0])).toBe(0);
  });

  it('rejects a negative line discount', () => {
    useCartStore.getState().addItem(LINE);
    useCartStore.getState().setLineDiscount('v1', -200);

    expect(useCartStore.getState().lines[0].lineDiscount).toBe(0);
  });
});

describe('Cart store (cart-level discounts: fixed and percentage)', () => {
  beforeEach(() => {
    useCartStore.setState({ lines: [], discountMode: 'fixed', discountValue: 0 });
  });

  it('computes a fixed cart discount as a flat currency amount', () => {
    const lines = [{ ...LINE, quantity: 1, lineDiscount: 0 }];
    expect(cartDiscountAmount(lines, 'fixed', 500)).toBe(500);
    expect(cartGrandTotal(lines, 'fixed', 500)).toBe(6999);
  });

  it('computes a percentage cart discount against the post-line-discount subtotal', () => {
    const lines = [{ ...LINE, quantity: 2, unitPrice: 1000, lineDiscount: 0 }]; // subtotal 2000
    expect(cartDiscountAmount(lines, 'percentage', 10)).toBe(200);
    expect(cartGrandTotal(lines, 'percentage', 10)).toBe(1800);
  });

  it('clamps a percentage discount at 100%', () => {
    const lines = [{ ...LINE, quantity: 1, unitPrice: 1000, lineDiscount: 0 }];
    expect(cartDiscountAmount(lines, 'percentage', 150)).toBe(1000);
  });

  it('never lets a cart-level discount push the total below zero', () => {
    const lines = [{ ...LINE, quantity: 1, unitPrice: 500, lineDiscount: 0 }];
    expect(cartDiscountAmount(lines, 'fixed', 999999)).toBe(500);
    expect(cartGrandTotal(lines, 'fixed', 999999)).toBe(0);
  });

  it('applies cart-level discount on top of line-level discounts, not double-counted', () => {
    const lines = [{ ...LINE, quantity: 1, unitPrice: 1000, lineDiscount: 100 }]; // after line discount: 900
    expect(cartDiscountAmount(lines, 'percentage', 10)).toBe(90); // 10% of 900
    expect(cartGrandTotal(lines, 'percentage', 10)).toBe(810);
  });
});

describe('Cart store (totals and monetary precision)', () => {
  it('cartSubtotal sums unit price times quantity across all lines', () => {
    const lines = [
      { ...LINE, quantity: 1, lineDiscount: 0 },
      { ...LINE, variantId: 'v2', unitPrice: 1000, quantity: 1, lineDiscount: 0 },
    ];
    expect(cartSubtotal(lines)).toBe(7499 + 1000);
  });

  it('lineSubtotal and lineTotal account for quantity and item discount', () => {
    const line = { ...LINE, quantity: 3, unitPrice: 100, lineDiscount: 50 };
    expect(lineSubtotal(line)).toBe(300);
    expect(lineTotal(line)).toBe(250);
  });

  it('cartLineDiscounts sums every line\'s own discount', () => {
    const lines = [
      { ...LINE, quantity: 1, lineDiscount: 50 },
      { ...LINE, variantId: 'v2', quantity: 1, lineDiscount: 25 },
    ];
    expect(cartLineDiscounts(lines)).toBe(75);
  });

  it('roundMoney avoids floating-point drift artifacts', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(19.999999999)).toBe(20);
    expect(roundMoney(-0)).toBe(0);
  });
});
