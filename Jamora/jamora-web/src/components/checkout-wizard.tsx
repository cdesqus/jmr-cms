"use client";

import { useCallback, useReducer, useState } from "react";
import {
  AddressAssistStep,
  AddressWarnings,
} from "@/components/address-assist-step";
import { DeliveryStep } from "@/components/delivery-step";
import { PaymentMethodSelector } from "@/components/payment-method-selector";
import {
  CHECKOUT_STEPS,
  checkoutPaymentCurrency,
  checkoutWizardReducer,
  initialCheckoutWizardState,
  type CheckoutMode,
  type CheckoutStep,
  type ShippingQuote,
} from "@/lib/checkout-wizard-policy.cjs";
import {
  normaliseRomanianAddress,
  validateRomanianAddress,
  type StructuredAddress,
} from "@/lib/commerce/address.cjs";
import type { PaymentMethod } from "@/lib/payment-customer-policy.cjs";
import { assessRomanianAddress, quoteShipping } from "@/lib/shipping-api";

export type CheckoutWizardSubmission = {
  contact: { name: string; email: string };
  address: StructuredAddress;
  selectedQuote?: ShippingQuote;
  paymentMethod: PaymentMethod;
  reservationCapability?: string;
};

type CheckoutItem = { slug: string; qty: number };

function addressSummary(address: StructuredAddress) {
  return [
    address.recipient,
    `${address.street} ${address.building}${address.unit ? `, ${address.unit}` : ""}`,
    `${address.postalCode} ${address.locality}${address.subdivisionCode ? `, ${address.subdivisionCode}` : ""}`,
    "Romania",
  ];
}

export function CheckoutWizard({
  mode,
  initialContact,
  initialAddress,
  authenticated,
  addressAssistEnabled,
  shippingEnabled,
  paymentsEnabled,
  items,
  fallbackShippingLabel,
  checkingOut,
  checkoutError,
  onQuoteChange,
  onContactChange,
  onSubmit,
}: {
  mode: CheckoutMode;
  initialContact: { name: string; email: string };
  initialAddress: StructuredAddress;
  authenticated: boolean;
  addressAssistEnabled: boolean;
  shippingEnabled: boolean;
  paymentsEnabled: boolean;
  items: CheckoutItem[];
  fallbackShippingLabel: string;
  checkingOut: boolean;
  checkoutError: string;
  onQuoteChange(quote?: ShippingQuote): void;
  onContactChange?(contact: { name: string; email: string }): void;
  onSubmit(value: CheckoutWizardSubmission): Promise<void>;
}) {
  const [state, dispatch] = useReducer(
    checkoutWizardReducer,
    initialCheckoutWizardState(mode, {
      contact: initialContact,
      address: initialAddress,
    }),
  );
  const [addressErrors, setAddressErrors] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [quoteError, setQuoteError] = useState("");
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const step = state.step as CheckoutStep;
  const contact = state.contact as { name: string; email: string };
  const address = normaliseRomanianAddress(state.address);
  const addressWarnings = state.addressWarnings as string[];
  const selectedQuote = state.selectedQuote as ShippingQuote | undefined;
  const paymentMethod = state.paymentMethod as PaymentMethod;
  const reservationCapability = state.reservationCapability as string | undefined;
  const paymentCurrency = checkoutPaymentCurrency(mode, shippingEnabled);

  const setPaymentMethod = useCallback((value: PaymentMethod) => {
    dispatch({ type: "payment", value });
  }, []);

  async function ensureGuestCapability() {
    if (authenticated) return undefined;
    if (reservationCapability) return reservationCapability;
    const response = await fetch("/api/jamora/inventory/reserve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: contact.email.trim(),
        customerName: contact.name.trim(),
        items,
      }),
    });
    const result = await response.json().catch(() => ({})) as {
      reservationToken?: string;
      error?: string;
    };
    if (!response.ok || !result.reservationToken) {
      throw new Error(result.error ?? "Stock could not be reserved.");
    }
    dispatch({ type: "capability", value: result.reservationToken });
    return result.reservationToken;
  }

  async function loadQuotes(nextAddress = address) {
    if (!shippingEnabled) return;
    setLoadingQuotes(true);
    setQuoteError("");
    setQuotes([]);
    dispatch({ type: "quote", value: undefined });
    onQuoteChange(undefined);
    try {
      const capability = authenticated
        ? undefined
        : reservationCapability || await ensureGuestCapability();
      const next = await quoteShipping({
        subjectType: mode === "member" ? "membership_checkout" : "order",
        address: nextAddress,
        items,
        reservationCapability: capability,
      });
      setQuotes(next);
    } catch (caught) {
      setQuoteError(caught instanceof Error ? caught.message : "Delivery quotes are unavailable.");
    } finally {
      setLoadingQuotes(false);
    }
  }

  async function next() {
    setNavigationError("");
    if (step === "contact") {
      if (!contact.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
        setNavigationError("Enter a full name and valid email address.");
        return;
      }
      try {
        if (!authenticated && (addressAssistEnabled || shippingEnabled)) {
          await ensureGuestCapability();
        }
        dispatch({ type: "next" });
      } catch (caught) {
        setNavigationError(caught instanceof Error ? caught.message : "Checkout could not start.");
      }
      return;
    }
    if (step === "address") {
      const normalized = normaliseRomanianAddress(address);
      let errors = validateRomanianAddress(normalized);
      let warnings: string[] = [];
      if (!errors.length && addressAssistEnabled) {
        try {
          const assessment = await assessRomanianAddress(
            normalized,
            authenticated ? undefined : reservationCapability,
          );
          errors = assessment.errors;
          warnings = assessment.warnings;
          dispatch({ type: "address", value: assessment.address });
        } catch {
          warnings = ["Address verification is unavailable. Review the manual fields carefully."];
        }
      }
      setAddressErrors(errors);
      dispatch({ type: "warnings", value: warnings });
      if (errors.length) {
        setNavigationError("Complete the required address fields before continuing.");
        return;
      }
      dispatch({ type: "next" });
      await loadQuotes(normalized);
      return;
    }
    if (step === "delivery") {
      if (shippingEnabled && !selectedQuote) {
        setNavigationError("Select a delivery quote before continuing.");
        return;
      }
      dispatch({ type: "next" });
      return;
    }
    if (step === "payment") {
      dispatch({ type: "next" });
    }
  }

  return (
    <section className="mt-5 border-t border-clay/60 pt-5" aria-labelledby="checkout-heading">
      <h3 id="checkout-heading" className="font-display text-lg text-ink">Checkout</h3>
      <nav aria-label="Checkout progress" className="mt-3">
        <ol className="grid grid-cols-5 gap-1 text-center text-[0.65rem] uppercase tracking-wide text-stone">
          {CHECKOUT_STEPS.map((candidate, index) => (
            <li
              key={candidate}
              aria-current={candidate === step ? "step" : undefined}
              className={candidate === step ? "font-semibold text-terracotta-deep" : ""}
            >
              <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-current">
                {index + 1}
              </span>
              {candidate}
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-6">
        {step === "contact" ? (
          <div className="space-y-3">
            {mode === "member" ? (
              <p className="rounded-lg bg-herb/10 p-3 text-sm text-herb-deep">
                Membership redemption uses your verified customer account. Delivery remains customer-paid.
              </p>
            ) : authenticated ? (
              <p className="rounded-lg bg-sand/50 p-3 text-sm text-bark">
                Checkout is bound to your verified customer session.
              </p>
            ) : (
              <p className="text-sm text-stone">
                Guest checkout will use an opaque reservation capability, never browser-supplied identity.
              </p>
            )}
            <label className="block text-xs font-semibold uppercase text-stone">
              Full name
              <input
                value={contact.name}
                readOnly={authenticated}
                onChange={(event) => {
                  const nextContact = { ...contact, name: event.target.value };
                  dispatch({
                    type: "contact",
                    value: nextContact,
                  });
                  onContactChange?.(nextContact);
                  dispatch({ type: "capability", value: "" });
                }}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm normal-case text-ink outline-none focus:border-terracotta read-only:bg-sand/50"
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-stone">
              Email
              <input
                value={contact.email}
                readOnly={authenticated}
                onChange={(event) => {
                  const nextContact = { ...contact, email: event.target.value };
                  dispatch({
                    type: "contact",
                    value: nextContact,
                  });
                  onContactChange?.(nextContact);
                  dispatch({ type: "capability", value: "" });
                }}
                type="email"
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm normal-case text-ink outline-none focus:border-terracotta read-only:bg-sand/50"
              />
            </label>
          </div>
        ) : null}

        {step === "address" ? (
          <AddressAssistStep
            value={address}
            onChange={(value) => {
              dispatch({ type: "address", value });
              dispatch({ type: "quote", value: undefined });
              onQuoteChange(undefined);
              setAddressErrors([]);
              dispatch({ type: "warnings", value: [] });
            }}
            errors={addressErrors}
            warnings={addressWarnings}
            enabled={addressAssistEnabled}
            reservationCapability={authenticated ? undefined : reservationCapability}
          />
        ) : null}

        {step === "delivery" ? (
          <div className="space-y-4">
            <AddressWarnings warnings={addressWarnings} />
            <DeliveryStep
              authoritative={shippingEnabled}
              quotes={quotes}
              selected={selectedQuote}
              loading={loadingQuotes}
              error={quoteError}
              fallbackShippingLabel={fallbackShippingLabel}
              onSelect={(quote) => {
                dispatch({ type: "quote", value: quote });
                onQuoteChange(quote);
                setNavigationError("");
              }}
              onRetry={() => void loadQuotes()}
            />
          </div>
        ) : null}

        {step === "payment" ? (
          mode !== "member" || paymentsEnabled || shippingEnabled ? (
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
              currency={paymentCurrency}
              disabled={checkingOut}
            />
          ) : (
            <p className="rounded-lg bg-sand/50 p-3 text-sm text-bark">
              Payment is not required for this feature-off membership fallback.
            </p>
          )
        ) : null}

        {step === "review" ? (
          <div>
            <p className="text-sm font-semibold text-ink">Read-only review</p>
            <div className="mt-3">
              <AddressWarnings warnings={addressWarnings} />
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-bark">Contact</dt>
                <dd className="text-ink">{contact.name}<br />{contact.email}</dd>
              </div>
              <div>
                <dt className="font-semibold text-bark">Shipping address</dt>
                <dd className="text-ink">
                  {addressSummary(address).map((line) => <span className="block" key={line}>{line}</span>)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-bark">Delivery</dt>
                <dd className="text-ink">
                  {selectedQuote
                    ? `${selectedQuote.carrier} · ${selectedQuote.service} · ${
                        new Intl.NumberFormat("en", { style: "currency", currency: "RON" })
                          .format(selectedQuote.amountMinor / 100)
                      }`
                    : fallbackShippingLabel}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-bark">Payment</dt>
                <dd className="text-ink">
                  {mode === "member" && !paymentsEnabled && !shippingEnabled
                    ? "Feature-off membership fallback"
                    : paymentMethod === "ropay" ? "RoPay" : "Manual bank transfer"}
                </dd>
              </div>
            </dl>
            {shippingEnabled ? (
              <p className="mt-4 rounded-lg bg-sand/50 p-3 text-xs text-bark">
                The browser does not calculate the final price. The server revalidates the selected quote,
                creates the pending subject, and returns authoritative payment instructions.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {navigationError ? <p className="mt-3 text-sm text-terracotta-deep" role="alert">{navigationError}</p> : null}
      {checkoutError ? <p className="mt-3 text-sm text-terracotta-deep" role="alert">{checkoutError}</p> : null}

      <div className="mt-5 flex gap-3">
        {step !== "contact" ? (
          <button
            type="button"
            onClick={() => {
              setNavigationError("");
              dispatch({ type: "back" });
            }}
            disabled={checkingOut}
            className="rounded-full border border-clay px-5 py-2.5 text-sm font-semibold text-bark disabled:opacity-60"
          >
            Back
          </button>
        ) : null}
        {step !== "review" ? (
          <button
            type="button"
            onClick={() => void next()}
            disabled={checkingOut || loadingQuotes}
            className="ml-auto rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep disabled:opacity-60"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onSubmit({
              contact: {
                name: contact.name.trim(),
                email: contact.email.trim(),
              },
              address,
              selectedQuote,
              paymentMethod,
              reservationCapability,
            })}
            disabled={checkingOut}
            className="ml-auto rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep disabled:opacity-60"
          >
            {checkingOut ? "Preparing payment…" : "Place pending order"}
          </button>
        )}
      </div>
    </section>
  );
}
