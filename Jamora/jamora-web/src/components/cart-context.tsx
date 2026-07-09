"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "@/lib/products";

const STORAGE_KEY = "jamora.cart.v2";

// The cart stores a snapshot of each product so it no longer depends on a
// static catalogue — line items survive even if the source is the Medusa CMS.
export interface CartLine {
  product: Product;
  qty: number;
}

interface CartState {
  lines: CartLine[];
}

type CartAction =
  | { type: "add"; product: Product; qty?: number }
  | { type: "setQty"; productId: string; qty: number }
  | { type: "remove"; productId: string }
  | { type: "clear" }
  | { type: "hydrate"; lines: CartLine[] };

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const qty = action.qty ?? 1;
      const existing = state.lines.find((l) => l.product.id === action.product.id);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.product.id === action.product.id ? { ...l, qty: l.qty + qty } : l,
          ),
        };
      }
      return { lines: [...state.lines, { product: action.product, qty }] };
    }
    case "setQty": {
      if (action.qty <= 0) {
        return { lines: state.lines.filter((l) => l.product.id !== action.productId) };
      }
      return {
        lines: state.lines.map((l) =>
          l.product.id === action.productId ? { ...l, qty: action.qty } : l,
        ),
      };
    }
    case "remove":
      return { lines: state.lines.filter((l) => l.product.id !== action.productId) };
    case "clear":
      return { lines: [] };
    case "hydrate":
      return { lines: action.lines };
    default:
      return state;
  }
}

export interface CartItem extends CartLine {
  lineTotalCents: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  isOpen: boolean;
  add: (product: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { lines: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted cart once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const lines = JSON.parse(raw) as CartLine[];
        if (Array.isArray(lines)) dispatch({ type: "hydrate", lines });
      }
    } catch {
      // Ignore malformed storage.
    }
    // Synchronising React with an external store (localStorage) on mount — the
    // documented escape hatch; there is no server value to read at first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  // Persist on change (after initial hydration to avoid clobbering).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
    } catch {
      // Storage may be unavailable (private mode) — fail silently.
    }
  }, [state.lines, hydrated]);

  const add = useCallback((product: Product, qty?: number) => {
    dispatch({ type: "add", product, qty });
    setIsOpen(true);
  }, []);
  const setQty = useCallback(
    (productId: string, qty: number) => dispatch({ type: "setQty", productId, qty }),
    [],
  );
  const remove = useCallback(
    (productId: string) => dispatch({ type: "remove", productId }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  const value = useMemo<CartContextValue>(() => {
    const items: CartItem[] = state.lines.map((line) => ({
      ...line,
      lineTotalCents: line.product.priceCents * line.qty,
    }));

    return {
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotalCents: items.reduce((n, i) => n + i.lineTotalCents, 0),
      isOpen,
      add,
      setQty,
      remove,
      clear,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
    };
  }, [state.lines, isOpen, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
