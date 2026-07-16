"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createMockOrder,
  saveMockOrder,
  syncMockOrderToStrapi,
} from "@/lib/mock-orders";
import { formatEUR } from "@/lib/products";
import { useCart } from "@/components/cart-context";
import { ProductVisual } from "@/components/product-visual";

const FREE_SHIPPING_CENTS = 5000;
const PAYMENTS = ["Card", "iDEAL", "Bancontact", "Klarna", "Apple Pay", "Google Pay"];

interface AppliedCoupon {
  code: string;
  name: string;
  discountCents: number;
  signature: string;
}

export function CartView() {
  const router = useRouter();
  const { items, subtotalCents, setQty, remove, clear } = useCart();
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

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

  const shipping = subtotalCents >= FREE_SHIPPING_CENTS ? 0 : 495;
  const remainingForFree = FREE_SHIPPING_CENTS - subtotalCents;
  const cartSignature = items.map((item) => `${item.product.slug}:${item.qty}`).sort().join("|");
  const normalizedCouponCode = couponCode.trim().toUpperCase();
  const activeCoupon = appliedCoupon?.signature === cartSignature && appliedCoupon.code === normalizedCouponCode
    ? appliedCoupon
    : null;
  const discountCents = activeCoupon?.discountCents ?? 0;
  const canCheckout =
    customer.name.trim() && customer.email.trim() && customer.address.trim();

  async function validateCoupon(code: string) {
    const response = await fetch("/api/jamora/promotions/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        email: customer.email.trim(),
        subtotalCents,
        items: items.map((item) => ({
          slug: item.product.slug,
          qty: item.qty,
          unitPriceCents: item.product.priceCents,
          lineTotalCents: item.lineTotalCents,
        })),
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.valid) {
      throw new Error(json.error ?? "Coupon could not be applied.");
    }
    return json as {
      promotion: { code: string; name: string };
      discountCents: number;
    };
  }

  async function applyCoupon() {
    if (!normalizedCouponCode) return;
    setCheckingCoupon(true);
    setCouponMessage("");
    try {
      const result = await validateCoupon(normalizedCouponCode);
      setCouponCode(result.promotion.code);
      setAppliedCoupon({
        code: result.promotion.code,
        name: result.promotion.name,
        discountCents: result.discountCents,
        signature: cartSignature,
      });
      setCouponMessage(`${result.promotion.name} applied.`);
    } catch (caught) {
      setAppliedCoupon(null);
      setCouponMessage(caught instanceof Error ? caught.message : "Coupon could not be applied.");
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function handleCheckout() {
    if (!canCheckout) {
      setError("Please add your name, email, and shipping address.");
      return;
    }

    setCheckingOut(true);
    setError("");
    try {
      let checkoutCoupon = activeCoupon;
      if (activeCoupon) {
        const refreshed = await validateCoupon(activeCoupon.code);
        checkoutCoupon = {
          code: refreshed.promotion.code,
          name: refreshed.promotion.name,
          discountCents: refreshed.discountCents,
          signature: cartSignature,
        };
      }

      const reservationResponse = await fetch("/api/jamora/inventory/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: customer.email.trim(),
          items: items.map((item) => ({
            productId: item.product.id,
            sku: item.product.sku,
            slug: item.product.slug,
            name: item.product.name,
            qty: item.qty,
            unitPriceCents: item.product.priceCents,
            lineTotalCents: item.lineTotalCents,
          })),
        }),
      });
      const reservation = await reservationResponse.json().catch(() => ({}));
      if (!reservationResponse.ok || !reservation.reservationToken) {
        throw new Error(reservation.error ?? "Stock could not be reserved.");
      }

      const order = createMockOrder({
        items,
        subtotalCents,
        shippingCents: shipping,
        discountCents: checkoutCoupon?.discountCents,
        promotionCode: checkoutCoupon?.code,
        reservationToken: reservation.reservationToken,
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          address: customer.address.trim(),
        },
      });
      const synced = await syncMockOrderToStrapi(order);
      if (!synced.ok) throw new Error(synced.error);
      saveMockOrder(order);
      clear();
      router.push(`/checkout/success?order=${encodeURIComponent(order.id)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout could not be completed.");
    } finally {
      setCheckingOut(false);
    }
  }

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
                      -
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
          {discountCents > 0 ? (
            <div className="flex justify-between text-herb-deep">
              <dt>Discount ({activeCoupon?.code})</dt>
              <dd>-{formatEUR(discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-clay/60 pt-2 font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="text-ink">{formatEUR(Math.max(0, subtotalCents - discountCents + shipping))}</dd>
          </div>
        </dl>

        {remainingForFree > 0 && (
          <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-bark">
            Add {formatEUR(remainingForFree)} more for free EU shipping.
          </p>
        )}

        <div className="mt-4 border-t border-clay/60 pt-4">
          <label className="text-xs font-semibold uppercase text-stone">Coupon code</label>
          <div className="mt-1 flex gap-2">
            <input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") void applyCoupon();
              }}
              placeholder="WELCOME10"
              className="min-w-0 flex-1 rounded-lg border border-clay bg-cream px-3 py-2 text-sm font-semibold uppercase text-ink outline-none focus:border-terracotta"
            />
            <button
              type="button"
              onClick={applyCoupon}
              disabled={checkingCoupon || !normalizedCouponCode}
              className="rounded-lg border border-terracotta px-4 py-2 text-sm font-semibold text-terracotta disabled:opacity-50"
            >
              {checkingCoupon ? "Checking..." : "Apply"}
            </button>
          </div>
          {couponMessage ? (
            <p className={`mt-2 text-xs ${activeCoupon ? "text-herb-deep" : "text-terracotta-deep"}`}>
              {couponMessage}
            </p>
          ) : null}
          {appliedCoupon && !activeCoupon ? (
            <p className="mt-2 text-xs text-terracotta-deep">Cart changed. Apply the coupon again.</p>
          ) : null}
        </div>

        <div className="mt-5 space-y-3 border-t border-clay/60 pt-5">
          <label className="block text-xs font-semibold uppercase text-stone">
            Full name
            <input
              value={customer.name}
              onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm normal-case text-ink outline-none focus:border-terracotta"
              autoComplete="name"
            />
          </label>
          <label className="block text-xs font-semibold uppercase text-stone">
            Email
            <input
              value={customer.email}
              onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm normal-case text-ink outline-none focus:border-terracotta"
              type="email"
              autoComplete="email"
            />
          </label>
          <label className="block text-xs font-semibold uppercase text-stone">
            Shipping address
            <textarea
              value={customer.address}
              onChange={(e) =>
                setCustomer((c) => ({ ...c, address: e.target.value }))
              }
              className="mt-1 min-h-20 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm normal-case text-ink outline-none focus:border-terracotta"
              autoComplete="shipping street-address"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-terracotta-deep">{error}</p>}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkingOut}
          className="mt-5 w-full rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream hover:bg-terracotta-deep disabled:opacity-60"
        >
          {checkingOut ? "Reserving stock..." : "Mock paid checkout"}
        </button>
        <p className="mt-2 text-center text-xs text-stone">
          Test mode: order is marked as paid without charging a card.
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
