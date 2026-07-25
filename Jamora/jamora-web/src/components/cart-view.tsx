"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createMockOrder,
  saveMockOrder,
  syncMockOrderToStrapi,
  type MockOrder,
} from "@/lib/mock-orders";
import { formatEUR } from "@/lib/products";
import { useCart } from "@/components/cart-context";
import { ProductVisual } from "@/components/product-visual";
import {
  CheckoutWizard,
  type CheckoutWizardSubmission,
} from "@/components/checkout-wizard";
import {
  MembershipRedemption,
  type RedemptionMembership,
} from "@/components/membership-redemption";
import {
  normaliseRomanianAddress,
} from "@/lib/commerce/address.cjs";
import {
  formatRomanianAddress,
  getOrCreateAnonymousSessionId,
  guestShippingCents,
} from "@/lib/commerce/checkout.cjs";
import { membershipCartProjection } from "@/lib/commerce/membership-checkout.cjs";
import { PaymentInstructions } from "@/components/payment-instructions";
import type { CustomerPaymentSnapshot } from "@/lib/payment-customer-policy.cjs";
import {
  checkoutAttempt,
  paymentPreparationRequest,
  pendingCheckoutOrderState,
} from "@/lib/payment-customer-view.cjs";
import {
  authoritativeShippingCheckoutFields,
  checkoutCompletionMode,
  membershipShippingReservationFields,
  type ShippingQuote,
} from "@/lib/checkout-wizard-policy.cjs";

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

export function CartView({
  structuredCheckoutEnabled = false,
  addressAssistEnabled = false,
  shippingEnabled = false,
  paymentsEnabled = false,
  membership,
  signedCustomer,
}: {
  structuredCheckoutEnabled?: boolean;
  addressAssistEnabled?: boolean;
  shippingEnabled?: boolean;
  paymentsEnabled?: boolean;
  membership?: RedemptionMembership;
  signedCustomer?: {
    documentId: string;
    name: string;
    email: string;
  };
}) {
  const router = useRouter();
  const { items, subtotalCents, setQty, remove, clear } = useCart();
  const [error, setError] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState(signedCustomer?.email ?? "");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [membershipMode, setMembershipMode] = useState(false);
  const [selectedShippingQuote, setSelectedShippingQuote] = useState<ShippingQuote>();
  const [payment, setPayment] = useState<CustomerPaymentSnapshot>();
  const [paymentCapability, setPaymentCapability] = useState("");
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const activeMembershipMode = membershipMode && !!membership;
  const cartSignature = items
    .map((item) => `${item.product.slug}:${item.qty}`)
    .sort()
    .join("|");
  const quoteScope = `${activeMembershipMode ? "member" : "ordinary"}:${cartSignature}`;
  const previousQuoteScopeRef = useRef(quoteScope);

  useEffect(() => {
    if (previousQuoteScopeRef.current === quoteScope) return;
    previousQuoteScopeRef.current = quoteScope;
    setSelectedShippingQuote(undefined);
    checkoutAttemptRef.current = null;
  }, [quoteScope]);

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
  const remainingForFree = 5000 - subtotalCents;
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
  async function validateCoupon(code: string, email = checkoutEmail) {
    const response = await fetch("/api/jamora/promotions/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        email: email.trim(),
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

  async function handleCheckout(details: CheckoutWizardSubmission) {
    setCheckingOut(true);
    setError("");
    let reservedCheckoutReference: string | undefined;
    try {
      if (shippingEnabled && !details.selectedQuote) {
        throw new Error("A server delivery quote is required.");
      }
      let checkoutCoupon = activeMembershipMode ? null : activeCoupon;
      if (activeCoupon) {
        const refreshed = await validateCoupon(activeCoupon.code, details.contact.email);
        checkoutCoupon = {
          code: refreshed.promotion.code,
          name: refreshed.promotion.name,
          discountCents: refreshed.discountCents,
          signature: cartSignature,
        };
      }

      const normalizedShippingAddress = normaliseRomanianAddress(details.address);
      const shippingFields = details.selectedQuote
        ? authoritativeShippingCheckoutFields(details.selectedQuote)
        : {};
      const attemptSignature = JSON.stringify({
        cart: cartSignature,
        membership: activeMembershipMode ? membership?.documentId : null,
        customer: details.contact,
        address: normalizedShippingAddress,
        quote: details.selectedQuote?.quoteId ?? null,
        paymentMethod: details.paymentMethod,
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
      if (!reservation && !activeMembershipMode && details.reservationCapability) {
        reservation = { reservationToken: details.reservationCapability };
        attempt.reservation = reservation;
      }
      if (!reservation) {
        const membershipReservation = activeMembershipMode && details.selectedQuote
          ? membershipShippingReservationFields({
              membershipDocumentId: membership.documentId,
              idempotencyKey: membershipAttemptKey,
            }, details.selectedQuote)
          : undefined;
        const reservationResponse = await fetch("/api/jamora/inventory/reserve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: details.contact.email,
            customerName: details.contact.name,
            shippingAddressText: formatRomanianAddress(normalizedShippingAddress),
            shippingAddress: normalizedShippingAddress,
            ...(activeMembershipMode ? {
              membershipCheckout: membershipReservation ?? {
                membershipDocumentId: membership.documentId,
                idempotencyKey: membershipAttemptKey,
              },
            } : {}),
            ...shippingFields,
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

      const completionMode = checkoutCompletionMode({
        mode: activeMembershipMode
          ? "member"
          : signedCustomer ? "customer" : "guest",
        paymentsEnabled,
        shippingEnabled,
      });
      let order = attempt.order;
      if (!order) {
        order = createMockOrder({
          items,
          subtotalCents: activeMembershipMode ? 0 : subtotalCents,
          shippingCents: shippingEnabled
            ? 0
            : activeMembershipMode ? membershipShipping : shipping,
          discountCents: activeMembershipMode ? 0 : checkoutCoupon?.discountCents,
          promotionCode: checkoutCoupon?.code,
          reservationToken: reservation.reservationToken,
          anonymousSessionId: structuredCheckoutEnabled || shippingEnabled
            ? getOrCreateAnonymousSessionId(localStorage, () => crypto.randomUUID())
            : undefined,
          shippingAddress: normalizedShippingAddress,
          customer: {
            name: details.contact.name,
            email: details.contact.email,
            address: formatRomanianAddress(normalizedShippingAddress),
          },
        });
        Object.assign(order, shippingFields);
        if (activeMembershipMode) {
          Object.assign(order, {
            membershipCheckout: {
              checkoutReference: reservation.checkoutReference,
              idempotencyKey: `${membershipAttemptKey}:finalize`,
            },
          });
        } else if (completionMode === "payment_pending") {
          Object.assign(order, pendingCheckoutOrderState(order.id, order.createdAt));
        }
        attempt.order = order;
      }
      if (completionMode === "legacy_sync") {
        if (activeMembershipMode) {
          const finalizeResponse = await fetch(
            "/api/jamora/membership/checkout-finalize",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                checkoutReference: reservation.checkoutReference,
                idempotencyKey: `${membershipAttemptKey}:finalize`,
                customerName: details.contact.name,
                shippingAddressText: formatRomanianAddress(
                  normalizedShippingAddress,
                ),
                shippingAddress: normalizedShippingAddress,
                estimatedDelivery: order.estimatedDelivery,
              }),
            },
          );
          if (!finalizeResponse.ok) {
            const result = await finalizeResponse.json().catch(() => ({}));
            throw new Error(
              result.error ?? "Membership checkout could not be completed.",
            );
          }
        } else {
          const synced = await syncMockOrderToStrapi(order);
          if (!synced.ok) throw new Error(synced.error);
        }
      } else {
        if (!attempt.preparedOrderDocumentId) {
          const orderResponse = await fetch(
            activeMembershipMode
              ? "/api/jamora/membership/checkout-order"
              : "/api/jamora/orders/pending-payment",
            {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(activeMembershipMode ? {
              checkoutReference: reservation.checkoutReference,
              idempotencyKey: `${membershipAttemptKey}:order`,
            } : order),
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
        const request = paymentPreparationRequest(details.paymentMethod, {
          idempotencyKey: `payment:${order.id}:${details.paymentMethod}`,
          subjectType: "order",
          subjectId: attempt.preparedOrderDocumentId,
          purpose: "order",
          currency: shippingEnabled ? "RON" : activeMembershipMode ? "EUR" : "RON",
          ...(activeMembershipMode
            ? { checkoutReference: reservation.checkoutReference }
            : { guestCheckoutCapability: reservation.reservationToken }),
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
        setPaymentCapability(activeMembershipMode ? "" : reservation.reservationToken);
      }
      saveMockOrder(order);
      checkoutAttemptRef.current = null;
      clear();
      if (completionMode === "legacy_sync") {
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
              {shippingEnabled
                ? selectedShippingQuote
                  ? new Intl.NumberFormat("en", { style: "currency", currency: "RON" })
                      .format(selectedShippingQuote.amountMinor / 100)
                  : "Select server quote"
                : cartSummary.shippingMinor === 0 ? "Free" : formatEUR(cartSummary.shippingMinor)}
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
            <dd className="text-right text-ink">
              {shippingEnabled ? "Server-confirmed at payment" : formatEUR(cartSummary.totalMinor)}
            </dd>
          </div>
        </dl>

        {!shippingEnabled && !activeMembershipMode && remainingForFree > 0 && (
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
            shippingLabel={shippingEnabled ? "Selected in delivery (RON)" : undefined}
            eligibleItems={eligibleMembershipItems.map((item) => ({
              name: item.product.name,
              qty: item.qty,
              creditCost: 1,
            }))}
            onChange={setMembershipMode}
          />
        ) : null}

        <CheckoutWizard
          key={`${activeMembershipMode ? "member" : signedCustomer ? "customer" : "guest"}:${cartSignature}`}
          mode={activeMembershipMode ? "member" : signedCustomer ? "customer" : "guest"}
          initialContact={{
            name: signedCustomer?.name ?? "",
            email: signedCustomer?.email ?? "",
          }}
          initialAddress={normaliseRomanianAddress({
            recipient: signedCustomer?.name ?? "",
          })}
          authenticated={!!signedCustomer}
          addressAssistEnabled={addressAssistEnabled}
          shippingEnabled={shippingEnabled}
          paymentsEnabled={paymentsEnabled}
          items={items.map((item) => ({ slug: item.product.slug, qty: item.qty }))}
          fallbackShippingLabel={
            (activeMembershipMode ? membershipShipping : shipping) === 0
              ? "Free delivery"
              : formatEUR(activeMembershipMode ? membershipShipping : shipping)
          }
          checkingOut={checkingOut}
          checkoutError={error}
          onQuoteChange={setSelectedShippingQuote}
          onContactChange={(contact) => setCheckoutEmail(contact.email)}
          onSubmit={handleCheckout}
        />
        <p className="mt-2 text-center text-xs text-stone">
          {paymentsEnabled
            ? "The order remains pending until the server verifies payment."
            : "The order is completed synchronously while online payment is off."}
        </p>
        <p className="mt-3 text-center text-[0.7rem] text-stone">
          Prices include VAT. A compliant VAT invoice is issued with every order.
        </p>
      </aside>
    </div>
  );
}
