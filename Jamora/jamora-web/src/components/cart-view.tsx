"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  createMockOrder,
  saveMockOrder,
  syncMockOrderToStrapi,
  type MockOrder,
} from "@/lib/mock-orders";
import { formatEUR } from "@/lib/products";
import { useCart } from "@/components/cart-context";
import { ProductVisual } from "@/components/product-visual";
import { StructuredAddressForm } from "@/components/structured-address-form";
import {
  MembershipRedemption,
  type RedemptionMembership,
} from "@/components/membership-redemption";
import {
  normaliseRomanianAddress,
  validateRomanianAddress,
  type StructuredAddress,
} from "@/lib/commerce/address.cjs";
import {
  formatRomanianAddress,
  getOrCreateAnonymousSessionId,
  guestShippingCents,
} from "@/lib/commerce/checkout.cjs";
import { membershipCartProjection } from "@/lib/commerce/membership-checkout.cjs";
import { PaymentMethodSelector } from "@/components/payment-method-selector";
import { PaymentInstructions } from "@/components/payment-instructions";
import type {
  CustomerPaymentSnapshot,
  PaymentMethod,
} from "@/lib/payment-customer-policy.cjs";
import {
  checkoutAttempt,
  paymentPreparationRequest,
  pendingCheckoutOrderState,
} from "@/lib/payment-customer-view.cjs";

interface AppliedCoupon {
  code: string;
  name: string;
  discountCents: number;
  signature: string;
}

interface CheckoutAttempt {
  signature: string;
  key: string;
  reservation?: {
    reservationToken: string;
    checkoutReference?: string;
  };
  order?: MockOrder;
  preparedOrderDocumentId?: string;
}

const EMPTY_ADDRESS = normaliseRomanianAddress();
export function CartView({
  structuredCheckoutEnabled = false,
  membership,
}: {
  structuredCheckoutEnabled?: boolean;
  membership?: RedemptionMembership;
}) {
  const router = useRouter();
  const { items, subtotalCents, setQty, remove, clear } = useCart();
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [shippingAddress, setShippingAddress] = useState<StructuredAddress>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [membershipMode, setMembershipMode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [payment, setPayment] = useState<CustomerPaymentSnapshot>();
  const [paymentCapability, setPaymentCapability] = useState("");
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);

  if (items.length === 0) {
    if (payment) {
      return (
        <div className="mt-8">
          <PaymentInstructions
            key={payment.paymentReference}
            reference={payment.paymentReference}
            initialSnapshot={payment}
            guestCheckoutCapability={paymentCapability}
          />
        </div>
      );
    }
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

  const shipping = guestShippingCents(subtotalCents);
  const membershipShipping = 495;
  const eligibleMembershipItems = membership
    ? items.filter((item) => membership.planSnapshot.eligibleProductSlugs.includes(item.product.slug))
    : [];
  const membershipCreditsRequired = eligibleMembershipItems.reduce((total, item) => total + item.qty, 0);
  const membershipCoveredMinor = eligibleMembershipItems.reduce((total, item) => total + item.lineTotalCents, 0);
  const activeMembershipMode = membershipMode && !!membership;
  const remainingForFree = 5000 - subtotalCents;
  const cartSignature = items.map((item) => `${item.product.slug}:${item.qty}`).sort().join("|");
  const normalizedCouponCode = couponCode.trim().toUpperCase();
  const activeCoupon = appliedCoupon?.signature === cartSignature && appliedCoupon.code === normalizedCouponCode
    ? appliedCoupon
    : null;
  const discountCents = activeCoupon?.discountCents ?? 0;
  const cartSummary = membershipCartProjection(activeMembershipMode
    ? {
        selected: true,
        coveredMerchandiseMinor: membershipCoveredMinor,
        shippingMinor: membershipShipping,
      }
    : {
        selected: false,
        subtotalMinor: subtotalCents,
        shippingMinor: shipping,
        discountMinor: discountCents,
      });
  const canCheckout = customer.name.trim() && customer.email.trim()
    && (structuredCheckoutEnabled
      ? validateRomanianAddress(normaliseRomanianAddress(shippingAddress)).length === 0
      : customer.address.trim());

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
      if (structuredCheckoutEnabled) {
        setAddressErrors(validateRomanianAddress(normaliseRomanianAddress(shippingAddress)));
      }
      setError("Please add your name, email, and shipping address.");
      return;
    }

    setCheckingOut(true);
    setError("");
    let reservedCheckoutReference: string | undefined;
    try {
      let checkoutCoupon = activeMembershipMode ? null : activeCoupon;
      if (activeCoupon) {
        const refreshed = await validateCoupon(activeCoupon.code);
        checkoutCoupon = {
          code: refreshed.promotion.code,
          name: refreshed.promotion.name,
          discountCents: refreshed.discountCents,
          signature: cartSignature,
        };
      }

      const normalizedShippingAddress = structuredCheckoutEnabled
        ? normaliseRomanianAddress(shippingAddress)
        : undefined;
      const attemptSignature = JSON.stringify({
        cart: cartSignature,
        membership: activeMembershipMode ? membership?.documentId : null,
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          address: normalizedShippingAddress ?? customer.address.trim(),
        },
        promotion: checkoutCoupon
          ? [checkoutCoupon.code, checkoutCoupon.discountCents]
          : null,
      });
      checkoutAttemptRef.current = checkoutAttempt(
        checkoutAttemptRef.current,
        attemptSignature,
        () => crypto.randomUUID(),
      ) as CheckoutAttempt;
      const attempt = checkoutAttemptRef.current;
      const membershipAttemptKey = attempt.key;
      let reservation = attempt.reservation;
      if (!reservation) {
        const reservationResponse = await fetch("/api/jamora/inventory/reserve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: customer.email.trim(),
            ...(activeMembershipMode ? {
              membershipCheckout: {
                membershipDocumentId: membership.documentId,
                idempotencyKey: membershipAttemptKey,
              },
            } : {}),
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
        const result = await reservationResponse.json().catch(() => ({}));
        if (!reservationResponse.ok || !result.reservationToken) {
          throw new Error(result.error ?? "Stock could not be reserved.");
        }
        reservation = {
          reservationToken: result.reservationToken,
          ...(result.checkoutReference
            ? { checkoutReference: result.checkoutReference }
            : {}),
        };
        attempt.reservation = reservation;
      }
      reservedCheckoutReference = activeMembershipMode
        ? reservation.checkoutReference
        : undefined;

      let order = attempt.order;
      if (!order) {
        order = createMockOrder({
          items,
          subtotalCents: activeMembershipMode ? 0 : subtotalCents,
          shippingCents: activeMembershipMode ? membershipShipping : shipping,
          discountCents: activeMembershipMode ? 0 : checkoutCoupon?.discountCents,
          promotionCode: checkoutCoupon?.code,
          reservationToken: reservation.reservationToken,
          anonymousSessionId: structuredCheckoutEnabled
            ? getOrCreateAnonymousSessionId(localStorage, () => crypto.randomUUID())
            : undefined,
          shippingAddress: normalizedShippingAddress,
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            address: normalizedShippingAddress
              ? formatRomanianAddress(normalizedShippingAddress)
              : customer.address.trim(),
          },
        });
        if (activeMembershipMode) {
          Object.assign(order, {
            membershipCheckout: {
              checkoutReference: reservation.checkoutReference,
              idempotencyKey: `${membershipAttemptKey}:finalize`,
            },
          });
        } else {
          Object.assign(order, pendingCheckoutOrderState(order.id, order.createdAt));
        }
        attempt.order = order;
      }
      if (activeMembershipMode) {
        const synced = await syncMockOrderToStrapi(order);
        if (!synced.ok) throw new Error(synced.error);
      } else {
        if (!attempt.preparedOrderDocumentId) {
          const orderResponse = await fetch("/api/jamora/orders/pending-payment", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(order),
          });
          const preparedOrder = await orderResponse.json().catch(() => ({})) as {
            order?: { documentId?: string };
            error?: string;
          };
          if (!orderResponse.ok || !preparedOrder.order?.documentId) {
            throw new Error(preparedOrder.error ?? "Order could not be prepared.");
          }
          attempt.preparedOrderDocumentId = preparedOrder.order.documentId;
        }
        const request = paymentPreparationRequest(paymentMethod, {
          idempotencyKey: `payment:${order.id}:${paymentMethod}`,
          subjectType: "order",
          subjectId: attempt.preparedOrderDocumentId,
          purpose: "order",
          currency: "RON",
          guestCheckoutCapability: reservation.reservationToken,
        });
        const paymentResponse = await fetch(request.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request.body),
        });
        const snapshot = await paymentResponse.json().catch(() => ({}));
        if (!paymentResponse.ok) {
          throw new Error("Payment instructions could not be prepared.");
        }
        setPayment(snapshot as CustomerPaymentSnapshot);
        setPaymentCapability(reservation.reservationToken);
      }
      saveMockOrder(order);
      checkoutAttemptRef.current = null;
      clear();
      if (activeMembershipMode) {
        router.push(`/checkout/success?order=${encodeURIComponent(order.id)}`);
      }
    } catch (caught) {
      if (activeMembershipMode && reservedCheckoutReference && checkoutAttemptRef.current) {
        const released = await fetch("/api/jamora/membership/checkout-release", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            checkoutReference: reservedCheckoutReference,
            idempotencyKey: `${checkoutAttemptRef.current.key}:release`,
          }),
        }).catch(() => undefined);
        if (released?.ok) checkoutAttemptRef.current = null;
      }
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
            <dt className="text-bark">{cartSummary.merchandiseLabel}</dt>
            <dd className="text-ink">
              {activeMembershipMode
                ? `${formatEUR(cartSummary.merchandiseMinor)} covered`
                : formatEUR(cartSummary.merchandiseMinor)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bark">Shipping (EU)</dt>
            <dd className="text-ink">
              {cartSummary.shippingMinor === 0 ? "Free" : formatEUR(cartSummary.shippingMinor)}
            </dd>
          </div>
          {!activeMembershipMode && discountCents > 0 ? (
            <div className="flex justify-between text-herb-deep">
              <dt>Discount ({activeCoupon?.code})</dt>
              <dd>-{formatEUR(discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-clay/60 pt-2 font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="text-ink">{formatEUR(cartSummary.totalMinor)}</dd>
          </div>
        </dl>

        {!activeMembershipMode && remainingForFree > 0 && (
          <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-bark">
            Add {formatEUR(remainingForFree)} more for free EU shipping.
          </p>
        )}

        {!activeMembershipMode ? <div className="mt-4 border-t border-clay/60 pt-4">
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
        </div> : null}

        {membership ? (
          <MembershipRedemption
            membership={membership}
            selected={membershipMode}
            coveredMinor={membershipCoveredMinor}
            creditsRequired={membershipCreditsRequired}
            shippingMinor={membershipShipping}
            eligibleItems={eligibleMembershipItems.map((item) => ({
              name: item.product.name,
              qty: item.qty,
              creditCost: 1,
            }))}
            onChange={setMembershipMode}
          />
        ) : null}

        {!activeMembershipMode ? (
          <PaymentMethodSelector
            value={paymentMethod}
            onChange={setPaymentMethod}
            disabled={checkingOut}
          />
        ) : null}

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
          {structuredCheckoutEnabled ? (
            <StructuredAddressForm
              value={shippingAddress}
              onChange={(value) => {
                setShippingAddress(value);
                setAddressErrors([]);
              }}
              errors={addressErrors}
            />
          ) : (
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
          )}
        </div>

        {error && <p className="mt-3 text-sm text-terracotta-deep">{error}</p>}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkingOut}
          className="mt-5 w-full rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream hover:bg-terracotta-deep disabled:opacity-60"
        >
          {checkingOut
            ? "Preparing payment…"
            : activeMembershipMode
              ? "Redeem membership credits"
              : "Continue to payment"}
        </button>
        {!activeMembershipMode ? (
          <p className="mt-2 text-center text-xs text-stone">
            Your order remains pending until the server verifies payment.
          </p>
        ) : null}
        <p className="mt-3 text-center text-[0.7rem] text-stone">
          Prices include VAT. A compliant VAT invoice is issued with every order.
        </p>
      </aside>
    </div>
  );
}
