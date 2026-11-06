import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DiscountMode = 'fixed' | 'percentage';

export interface CartLine {
  variantId: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
  /** Stock on hand at the branch at the moment this was added - caps further increments for this session. */
  availableQty: number;
  /** Item-level discount, a currency amount - mirrors CheckoutLineRequest.lineDiscount on the real backend. */
  lineDiscount: number;
}

interface CartState {
  lines: CartLine[];
  /** Cart-level discount mode and raw input value; the applied currency amount is derived via cartDiscountAmount(). */
  discountMode: DiscountMode;
  discountValue: number;
  /** True once the persisted cart has been read back from localStorage - avoids an SSR/client hydration mismatch. */
  hasHydrated: boolean;
  /** Returns false (and leaves the cart unchanged) if adding one more would exceed availableQty. */
  addItem: (line: Omit<CartLine, 'quantity' | 'lineDiscount'>) => boolean;
  /** Returns false (and leaves the cart unchanged) if already at availableQty. */
  incrementQty: (variantId: string) => boolean;
  decrementQty: (variantId: string) => void;
  removeItem: (variantId: string) => void;
  /** Clamped to [0, line subtotal] - a line can never discount below zero. */
  setLineDiscount: (variantId: string, amount: number) => void;
  setDiscountMode: (mode: DiscountMode) => void;
  setDiscountValue: (value: number) => void;
  clear: () => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      discountMode: 'fixed',
      discountValue: 0,
      hasHydrated: false,

      addItem: (line) => {
        const existing = get().lines.find((l) => l.variantId === line.variantId);
        const nextQty = (existing?.quantity ?? 0) + 1;
        if (nextQty > line.availableQty) {
          return false;
        }
        set((state) => {
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.variantId === line.variantId ? { ...l, quantity: nextQty, availableQty: line.availableQty } : l,
              ),
            };
          }
          return { lines: [...state.lines, { ...line, quantity: 1, lineDiscount: 0 }] };
        });
        return true;
      },

      incrementQty: (variantId) => {
        const line = get().lines.find((l) => l.variantId === variantId);
        if (!line || line.quantity + 1 > line.availableQty) {
          return false;
        }
        set((state) => ({
          lines: state.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + 1 } : l)),
        }));
        return true;
      },

      decrementQty: (variantId) =>
        set((state) => ({
          lines: state.lines
            .map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity - 1 } : l))
            .filter((l) => l.quantity > 0),
        })),

      removeItem: (variantId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.variantId !== variantId) })),

      setLineDiscount: (variantId, amount) =>
        set((state) => ({
          lines: state.lines.map((l) => {
            if (l.variantId !== variantId) return l;
            const lineSubtotal = roundMoney(l.unitPrice * l.quantity);
            return { ...l, lineDiscount: Math.min(Math.max(0, roundMoney(amount)), lineSubtotal) };
          }),
        })),

      setDiscountMode: (mode) => set({ discountMode: mode }),
      setDiscountValue: (value) => set({ discountValue: Math.max(0, value) }),

      clear: () => set({ lines: [], discountMode: 'fixed', discountValue: 0 }),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    }),
    {
      name: 'bata-pos-cashier-cart',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        lines: state.lines,
        discountMode: state.discountMode,
        discountValue: state.discountValue,
      }),
    },
  ),
);

/** Rounds to 2 decimal places and clamps -0 to 0, the standard safe-money boundary for display/arithmetic in this app. */
export function roundMoney(amount: number): number {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export function lineSubtotal(line: CartLine): number {
  return roundMoney(line.unitPrice * line.quantity);
}

export function lineTotal(line: CartLine): number {
  return roundMoney(lineSubtotal(line) - line.lineDiscount);
}

export function cartSubtotal(lines: CartLine[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + lineSubtotal(l), 0));
}

/** Sum of every line's own item-level discount - distinct from the cart-level discount applied on top. */
export function cartLineDiscounts(lines: CartLine[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + l.lineDiscount, 0));
}

/**
 * The cart-level discount's currency amount, clamped so it can never exceed
 * what's left after line-level discounts (mirrors the server's own implicit
 * cap: checkout rejects a payment total that would go negative).
 */
export function cartDiscountAmount(lines: CartLine[], mode: DiscountMode, value: number): number {
  const afterLineDiscounts = roundMoney(cartSubtotal(lines) - cartLineDiscounts(lines));
  const raw = mode === 'percentage' ? (afterLineDiscounts * Math.min(Math.max(0, value), 100)) / 100 : value;
  return roundMoney(Math.min(Math.max(0, raw), afterLineDiscounts));
}

export function cartGrandTotal(lines: CartLine[], mode: DiscountMode, value: number): number {
  const afterLineDiscounts = roundMoney(cartSubtotal(lines) - cartLineDiscounts(lines));
  return roundMoney(afterLineDiscounts - cartDiscountAmount(lines, mode, value));
}
