"use client";

import Link from "next/link";
import { formatEUR } from "@/lib/products";
import { useCart } from "@/components/cart-context";
import { ProductVisual } from "@/components/product-visual";

const FREE_SHIPPING_CENTS = 5000;

// EU local payment methods surfaced at checkout (Phase-2 integration target).
const PAYMENTS = ["Card", "iDEAL", "Bancontact", "Klarna", "Apple Pay", "Google Pay"];

export function CartView() {
  const { items, subtotalCents, setQty, remove, clear } = useCart();

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-clay/70 bg-white/40 p-12 text-center">
        <p className="text-stone">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-5 inline-flex rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          Browse the collection
        </Link>
      </div>
    );
  }

  const shipping =
    subtotalCents >= FREE_SHIPPING_CENTS ? 0 : 495;
  const remainingForFree = FREE_SHIPPING_CENTS - subtotalCents;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
      <div>
        <ul className="divide-y divide-clay/50 border-y border-clay/50">
          {items.map((item) => (
            <li key={item.product.id} className="flex gap-4 py-5">
              <ProductVisual product={item.product} className="h-28 w-22 shrink-0" />
              <div className="flex flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg text-ink">
                      <Link
                        href={`/product/${item.product.slug}`}
                        className="hover:text-terracotta"
                      >
                        {item.product.name}
                      </Link>
                    </h2>
                    <p className="text-xs text-stone">{item.product.netWeight}</p>
                  </div>
                  <span className="font-semibold text-ink">
                    {formatEUR(item.lineTotalCents)}
                  </span>
                </div>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center rounded-full border border-clay">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQty(item.product.id, item.qty - 1)}
                      className="px-3 py-1.5 text-bark hover:text-terracotta"
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-sm">{item.qty}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQty(item.product.id, item.qty + 1)}
                      className="px-3 py-1.5 text-bark hover:text-terracotta"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item.product.id)}
                    className="text-sm text-stone underline underline-offset-2 hover:text-terracotta"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={clear}
          className="mt-4 text-sm text-stone underline underline-offset-2 hover:text-terracotta"
        >
          Clear cart
        </button>
      </div>

      {/* Summary */}
      <aside className="h-fit rounded-xl border border-clay/70 bg-sand/30 p-6 lg:sticky lg:top-24">
        <h2 className="font-display text-xl text-ink">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-bark">Subtotal</dt>
            <dd className="text-ink">{formatEUR(subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bark">Shipping (EU)</dt>
            <dd className="text-ink">
              {shipping === 0 ? "Free" : formatEUR(shipping)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-clay/60 pt-2 font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="text-ink">{formatEUR(subtotalCents + shipping)}</dd>
          </div>
        </dl>

        {remainingForFree > 0 && (
          <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-bark">
            Add {formatEUR(remainingForFree)} more for free EU shipping.
          </p>
        )}

        <button
          type="button"
          disabled
          className="mt-5 w-full cursor-not-allowed rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream opacity-90"
          title="Payment integration ships in Phase 2"
        >
          Proceed to checkout
        </button>
        <p className="mt-2 text-center text-xs text-stone">
          Secure checkout with Stripe / Adyen — coming in Phase 2.
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PAYMENTS.map((p) => (
            <span
              key={p}
              className="rounded border border-clay bg-cream px-2 py-1 text-[0.65rem] font-medium text-stone"
            >
              {p}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center text-[0.7rem] text-stone">
          Prices include VAT. A compliant VAT invoice is issued with every order.
        </p>
      </aside>
    </div>
  );
}
