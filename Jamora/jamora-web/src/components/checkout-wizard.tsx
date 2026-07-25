"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  AddressAssistStep,
  AddressWarnings,
} from "@/components/address-assist-step";
import { DeliveryStep } from "@/components/delivery-step";
import { PaymentMethodSelector } from "@/components/payment-method-selector";
import {
  CHECKOUT_STEPS,
  canRetainCheckoutQuote,
  checkoutInputDigest,
  checkoutPaymentCurrency,
  checkoutWizardReducer,
  initialCheckoutWizardState,
  shouldAssessCheckoutAddress,
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
import {
  assessRomanianAddress,
  quoteShipping,
  ShippingHttpError,
} from "@/lib/shipping-api";

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
  const [busyOperation, setBusyOperation] = useState("");
  const operationRef = useRef<Promise<void> | undefined>(undefined);
  const capabilityRef = useRef<
    { token: string; expiresAt: string } | undefined
  >(undefined);
  const selectedDigestRef = useRef("");
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const step = state.step as CheckoutStep;
  const contact = state.contact as { name: string; email: string };
  const address = normaliseRomanianAddress(state.address);
  const addressWarnings = state.addressWarnings as string[];
  const selectedQuote = state.selectedQuote as ShippingQuote | undefined;
  const paymentMethod = state.paymentMethod as PaymentMethod;
  const reservationCapability = state.reservationCapability as string | undefined;
  const reservationCapabilityExpiresAt =
    state.reservationCapabilityExpiresAt as string | undefined;
  const paymentCurrency = checkoutPaymentCurrency(mode, shippingEnabled);
  const busy = checkingOut || Boolean(busyOperation);

  const setPaymentMethod = useCallback((value: PaymentMethod) => {
    dispatch({ type: "payment", value });
  }, []);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!selectedQuote) return;
    const expiries = [new Date(selectedQuote.expiresAt).getTime()];
    if (!authenticated && reservationCapabilityExpiresAt) {
      expiries.push(new Date(reservationCapabilityExpiresAt).getTime());
    }
    const deadline = Math.min(...expiries);
    if (!Number.isFinite(deadline)) return;
    const clearExpired = () => {
      dispatch({ type: "quote", value: undefined });
      selectedDigestRef.current = "";
      setQuotes([]);
      setQuoteError("Delivery quote expired. Request a new quote.");
      onQuoteChange(undefined);
      if (
        !authenticated &&
        reservationCapabilityExpiresAt &&
        new Date(reservationCapabilityExpiresAt).getTime() <= Date.now()
      ) {
        capabilityRef.current = undefined;
        dispatch({ type: "capability", value: undefined });
      }
      if (step === "payment" || step === "review") {
        dispatch({ type: "go", step: "delivery" });
      }
    };
    const delay = deadline - Date.now();
    if (delay <= 0) {
      clearExpired();
      return;
    }
    const timer = setTimeout(clearExpired, Math.min(delay, 2_147_000_000));
    (timer as unknown as { unref?: () => void }).unref?.();
    return () => clearTimeout(timer);
  }, [
    authenticated,
    onQuoteChange,
    reservationCapabilityExpiresAt,
    selectedQuote,
    step,
  ]);

  function clearSelectedQuote(clearAvailableQuotes = true) {
    dispatch({ type: "quote", value: undefined });
    selectedDigestRef.current = "";
    if (clearAvailableQuotes) setQuotes([]);
    onQuoteChange(undefined);
  }

  function clearGuestAuthority() {
    capabilityRef.current = undefined;
    dispatch({ type: "capability", value: undefined });
    clearSelectedQuote();
  }

  function runSingleFlight(
    operation: string,
    action: () => Promise<void>,
  ) {
    if (operationRef.current) return operationRef.current;
    setBusyOperation(operation);
    const pending = action()
      .finally(() => {
        if (operationRef.current === pending) {
          operationRef.current = undefined;
          setBusyOperation("");
        }
      });
    operationRef.current = pending;
    return pending;
  }

  async function ensureGuestCapability(force = false) {
    if (authenticated) return undefined;
    const current = capabilityRef.current ??
      (reservationCapability && reservationCapabilityExpiresAt
        ? {
            token: reservationCapability,
            expiresAt: reservationCapabilityExpiresAt,
          }
        : undefined);
    if (
      !force &&
      current &&
      new Date(current.expiresAt).getTime() > Date.now()
    ) {
      capabilityRef.current = current;
      return current.token;
    }
    if (current) clearGuestAuthority();
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
      expiresAt?: string;
      error?: string;
    };
    const expiresAt = new Date(result.expiresAt ?? "");
    if (
      !response.ok ||
      !result.reservationToken ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new Error(result.error ?? "Stock could not be reserved.");
    }
    const capability = {
      token: result.reservationToken,
      expiresAt: expiresAt.toISOString(),
    };
    capabilityRef.current = capability;
    dispatch({ type: "capability", value: capability });
    return result.reservationToken;
  }

  function recoverableAuthorityError(error: unknown) {
    return (
      error instanceof ShippingHttpError && error.status === 401
    ) || (
      error instanceof Error && /expired/i.test(error.message)
    );
  }

  async function withGuestAuthority<T>(
    action: (capability?: string) => Promise<T>,
  ) {
    let capability = authenticated ? undefined : await ensureGuestCapability();
    try {
      return await action(capability);
    } catch (error) {
      if (authenticated || !recoverableAuthorityError(error)) throw error;
      clearGuestAuthority();
      capability = await ensureGuestCapability(true);
      return action(capability);
    }
  }

  async function assessAndQuoteShipping(
    nextAddress = address,
    retainExisting = true,
  ) {
    const run = async (capability?: string) => {
      const assessment = await assessRomanianAddress(nextAddress, capability);
      const inputDigest = checkoutInputDigest(assessment.address, items);
      if (
        assessment.errors.length ||
        (retainExisting && canRetainCheckoutQuote({
          selectedQuote,
          selectedDigest: selectedDigestRef.current,
          nextDigest: inputDigest,
          capabilityExpiresAt: authenticated
            ? undefined
            : capabilityRef.current?.expiresAt ??
              reservationCapabilityExpiresAt,
        }))
      ) {
        return { assessment, inputDigest, quotes: undefined };
      }
      const nextQuotes = await quoteShipping({
        subjectType: mode === "member" ? "membership_checkout" : "order",
        address: assessment.address,
        items,
        reservationCapability: capability,
      });
      return { assessment, inputDigest, quotes: nextQuotes };
    };
    let capability = authenticated ? undefined : await ensureGuestCapability();
    try {
      return await run(capability);
    } catch (error) {
      if (authenticated || !recoverableAuthorityError(error)) throw error;
      clearGuestAuthority();
      capability = await ensureGuestCapability(true);
      return run(capability);
    }
  }

  async function reassessAndLoadQuotes(nextAddress = address) {
    setLoadingQuotes(true);
    setQuoteError("");
    try {
      const normalized = normaliseRomanianAddress(nextAddress);
      const result = await assessAndQuoteShipping(normalized, false);
      const { assessment } = result;
      setAddressErrors(assessment.errors);
      dispatch({ type: "warnings", value: assessment.warnings });
      dispatch({ type: "address", value: assessment.address });
      if (assessment.errors.length) {
        setQuoteError("Complete the required address fields before requesting delivery.");
        dispatch({ type: "go", step: "address" });
        return;
      }
      clearSelectedQuote();
      setQuotes(result.quotes ?? []);
    } catch (caught) {
      clearSelectedQuote();
      setQuoteError(
        caught instanceof Error
          ? caught.message
          : "Delivery quotes are unavailable.",
      );
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
      if (errors.length) {
        setAddressErrors(errors);
        dispatch({ type: "warnings", value: [] });
        setNavigationError("Complete the required address fields before continuing.");
        return;
      }
      if (shippingEnabled) {
        setLoadingQuotes(true);
        setQuoteError("");
        try {
          const result = await assessAndQuoteShipping(normalized);
          errors = result.assessment.errors;
          warnings = result.assessment.warnings;
          const assessedAddress = result.assessment.address;
          dispatch({ type: "address", value: assessedAddress });
          setAddressErrors(errors);
          dispatch({ type: "warnings", value: warnings });
          if (errors.length) {
            setNavigationError("Complete the required address fields before continuing.");
            return;
          }
          if (result.quotes) {
            setQuotes(result.quotes);
            if (!result.quotes.some(
              (candidate) => candidate.quoteId === selectedQuote?.quoteId,
            )) {
              clearSelectedQuote(false);
            } else {
              selectedDigestRef.current = result.inputDigest;
            }
          }
          dispatch({ type: "next" });
        } catch (caught) {
          clearSelectedQuote();
          setNavigationError(
            caught instanceof Error
              ? caught.message
              : "Address verification is unavailable.",
          );
        } finally {
          setLoadingQuotes(false);
        }
        return;
      }
      if (shouldAssessCheckoutAddress({
        addressAssistEnabled,
        shippingEnabled,
      })) {
        try {
          const assessment = await withGuestAuthority((capability) =>
            assessRomanianAddress(normalized, capability),
          );
          errors = assessment.errors;
          warnings = assessment.warnings;
          dispatch({ type: "address", value: assessment.address });
        } catch (caught) {
          if (shippingEnabled) {
            setNavigationError(
              caught instanceof Error
                ? caught.message
                : "Address verification is unavailable.",
            );
            return;
          }
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
      return;
    }
    if (step === "delivery") {
      if (shippingEnabled && !canRetainCheckoutQuote({
        selectedQuote,
        selectedDigest: selectedDigestRef.current,
        nextDigest: checkoutInputDigest(address, items),
        capabilityExpiresAt: authenticated
          ? undefined
          : capabilityRef.current?.expiresAt ??
            reservationCapabilityExpiresAt,
      })) {
        clearSelectedQuote();
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

      <p
        role="status"
        aria-label="Checkout step"
        aria-live="polite"
        className="sr-only"
      >
        {`${step.charAt(0).toUpperCase()}${step.slice(1)} step, ${
          CHECKOUT_STEPS.indexOf(step) + 1
        } of ${CHECKOUT_STEPS.length}.`}
      </p>

      <div className="mt-6">
        <h4
          key={step}
          ref={stepHeadingRef}
          tabIndex={-1}
          className="mb-4 font-display text-base text-ink"
        >
          {step.charAt(0).toUpperCase()}{step.slice(1)}
        </h4>
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
                disabled={Boolean(busyOperation)}
                onChange={(event) => {
                  const nextContact = { ...contact, name: event.target.value };
                  dispatch({
                    type: "contact",
                    value: nextContact,
                  });
                  onContactChange?.(nextContact);
                  clearGuestAuthority();
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
                disabled={Boolean(busyOperation)}
                onChange={(event) => {
                  const nextContact = { ...contact, email: event.target.value };
                  dispatch({
                    type: "contact",
                    value: nextContact,
                  });
                  onContactChange?.(nextContact);
                  clearGuestAuthority();
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
              if (!canRetainCheckoutQuote({
                selectedQuote,
                selectedDigest: selectedDigestRef.current,
                nextDigest: checkoutInputDigest(value, items),
                capabilityExpiresAt: authenticated
                  ? undefined
                  : capabilityRef.current?.expiresAt ??
                    reservationCapabilityExpiresAt,
              })) {
                clearSelectedQuote();
              }
              setAddressErrors([]);
              dispatch({ type: "warnings", value: [] });
            }}
            errors={addressErrors}
            warnings={addressWarnings}
            enabled={addressAssistEnabled}
            disabled={busy}
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
              disabled={busy}
              fallbackShippingLabel={fallbackShippingLabel}
              onSelect={(quote) => {
                dispatch({ type: "quote", value: quote });
                selectedDigestRef.current = checkoutInputDigest(address, items);
                onQuoteChange(quote);
                setNavigationError("");
              }}
              onRetry={() => {
                void runSingleFlight("quotes", () => reassessAndLoadQuotes());
              }}
            />
          </div>
        ) : null}

        {step === "payment" ? (
          paymentsEnabled ? (
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
              currency={paymentCurrency}
              disabled={busy}
            />
          ) : (
            <p className="rounded-lg bg-sand/50 p-3 text-sm text-bark">
              Payment uses the legacy synchronous checkout while online payment is off.
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
                  {!paymentsEnabled
                    ? "Legacy synchronous checkout"
                    : paymentMethod === "ropay" ? "RoPay" : "Manual bank transfer"}
                </dd>
              </div>
            </dl>
            {shippingEnabled && paymentsEnabled ? (
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
              if (!operationRef.current) dispatch({ type: "back" });
            }}
            disabled={busy}
            className="rounded-full border border-clay px-5 py-2.5 text-sm font-semibold text-bark disabled:opacity-60"
          >
            Back
          </button>
        ) : null}
        {step !== "review" ? (
          <button
            type="button"
            onClick={() => {
              void runSingleFlight(
                step === "contact"
                  ? "reservation"
                  : step === "address"
                    ? "assessment"
                    : "navigation",
                next,
              );
            }}
            disabled={busy || loadingQuotes}
            className="ml-auto rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep disabled:opacity-60"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void runSingleFlight("checkout", () => onSubmit({
                contact: {
                  name: contact.name.trim(),
                  email: contact.email.trim(),
                },
                address,
                selectedQuote,
                paymentMethod,
                reservationCapability: capabilityRef.current?.token ??
                  reservationCapability,
              }));
            }}
            disabled={busy || (shippingEnabled && !selectedQuote)}
            className="ml-auto rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep disabled:opacity-60"
          >
            {checkingOut
              ? paymentsEnabled ? "Preparing payment…" : "Placing order…"
              : paymentsEnabled ? "Place pending order" : "Place order"}
          </button>
        )}
      </div>
    </section>
  );
}
