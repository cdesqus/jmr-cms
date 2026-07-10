import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Checkout Canceled",
};

export default function CheckoutCancelPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <div className="rounded-xl border border-clay/70 bg-white/40 p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">
          Checkout canceled
        </p>
        <h1 className="mt-3 font-display text-4xl text-ink">No payment was taken</h1>
        <p className="mt-3 text-stone">
          Your cart is still available in this browser. You can review the items
          and try checkout again whenever you are ready.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/cart"
            className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep"
          >
            Return to cart
          </Link>
          <Link
            href="/shop"
            className="rounded-full border border-clay bg-white/60 px-6 py-2.5 text-sm font-semibold text-bark hover:border-terracotta hover:text-terracotta"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

