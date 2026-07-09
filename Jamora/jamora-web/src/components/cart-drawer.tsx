"use client";

import Link from "next/link";
import { formatEUR } from "@/lib/products";
import { useCart } from "@/components/cart-context";
import { ProductVisual } from "@/components/product-visual";

export function CartDrawer() {
  const { isOpen, closeCart, items, subtotalCents, setQty, remove, count } =
    useCart();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeCart}
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Shopping cart"
        aria-hidden={!isOpen}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-cream shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-clay/60 px-6 py-5">
          <h2 className="font-display text-xl text-ink">
            Your cart{count > 0 ? ` (${count})` : ""}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
            className="rounded-full p-1.5 text-bark hover:bg-sand"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-stone">Your cart is empty.</p>
            <Link
              href="/shop"
              onClick={closeCart}
              className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep"
            >
              Browse the collection
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-clay/50 overflow-y-auto px-6">
              {items.map((item) => (
                <li key={item.product.id} className="flex gap-4 py-4">
                  <ProductVisual
                    product={item.product}
                    className="h-20 w-16 shrink-0"
                  />
                  <div className="flex flex-1 flex-col">
                    <div className="flex justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">
                        {item.product.name}
                      </h3>
                      <span className="text-sm font-semibold text-ink">
                        {formatEUR(item.lineTotalCents)}
                      </span>
                    </div>
                    <p className="text-xs text-stone">{item.product.netWeight}</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center rounded-full border border-clay">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => setQty(item.product.id, item.qty - 1)}
                          className="px-3 py-1 text-bark hover:text-terracotta"
                        >
                          −
                        </button>
                        <span className="min-w-6 text-center text-sm">{item.qty}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => setQty(item.product.id, item.qty + 1)}
                          className="px-3 py-1 text-bark hover:text-terracotta"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(item.product.id)}
                        className="text-xs text-stone underline underline-offset-2 hover:text-terracotta"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-clay/60 px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-bark">Subtotal</span>
                <span className="font-display text-lg text-ink">
                  {formatEUR(subtotalCents)}
                </span>
              </div>
              <p className="mt-1 text-xs text-stone">
                VAT & EU shipping calculated at checkout.
              </p>
              <Link
                href="/cart"
                onClick={closeCart}
                className="mt-4 flex w-full items-center justify-center rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-cream hover:bg-terracotta-deep"
              >
                Go to checkout
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
