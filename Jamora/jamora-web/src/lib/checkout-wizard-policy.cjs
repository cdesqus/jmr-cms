"use strict";

const CHECKOUT_STEPS = Object.freeze([
  "contact",
  "address",
  "delivery",
  "payment",
  "review",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function initialCheckoutWizardState(mode = "guest", initial = {}) {
  if (!["guest", "customer", "member"].includes(mode)) {
    throw new TypeError("Checkout identity mode is invalid.");
  }
  return {
    steps: CHECKOUT_STEPS,
    step: CHECKOUT_STEPS[0],
    mode,
    contact: { ...(initial.contact ?? {}) },
    address: { ...(initial.address ?? {}) },
    addressWarnings: [...(initial.addressWarnings ?? [])],
    selectedQuote: initial.selectedQuote,
    paymentMethod: initial.paymentMethod ?? "bank_transfer",
  };
}

function checkoutWizardReducer(state, action) {
  const index = CHECKOUT_STEPS.indexOf(state.step);
  if (index < 0) throw new Error("Checkout step is invalid.");
  switch (action?.type) {
    case "next":
      return {
        ...state,
        step: CHECKOUT_STEPS[Math.min(CHECKOUT_STEPS.length - 1, index + 1)],
      };
    case "back":
      return {
        ...state,
        step: CHECKOUT_STEPS[Math.max(0, index - 1)],
      };
    case "go": {
      if (!CHECKOUT_STEPS.includes(action.step)) {
        throw new Error("Checkout step is invalid.");
      }
      return { ...state, step: action.step };
    }
    case "contact":
      return { ...state, contact: { ...action.value } };
    case "address":
      return { ...state, address: { ...action.value } };
    case "warnings":
      return { ...state, addressWarnings: [...action.value] };
    case "quote":
      return { ...state, selectedQuote: action.value };
    case "payment":
      return { ...state, paymentMethod: action.value };
    case "capability":
      return { ...state, reservationCapability: text(action.value) };
    default:
      throw new Error("Checkout action is invalid.");
  }
}

function checkoutIdentity(input) {
  const customerDocumentId = text(input?.customer?.documentId);
  if (input?.membershipSelected) {
    if (!customerDocumentId) {
      throw new Error("Membership checkout requires an authenticated customer.");
    }
    return { kind: "member", customerDocumentId };
  }
  if (customerDocumentId) return { kind: "customer", customerDocumentId };
  const reservationCapability = text(input?.reservationCapability);
  if (!reservationCapability) {
    throw new Error("Guest checkout requires a reservation capability.");
  }
  return { kind: "guest", reservationCapability };
}

function checkoutFeatureMode(env) {
  const addressAssist = env?.ADDRESS_ASSIST_ENABLED === "true";
  const authoritativeShipping = env?.SHIPPING_ENABLED === "true";
  return {
    addressAssist,
    authoritativeShipping,
    manualStructuredAddress: !addressAssist && !authoritativeShipping,
    steps: CHECKOUT_STEPS,
  };
}

function checkoutPaymentCurrency(mode, authoritativeShipping) {
  if (!["guest", "customer", "member"].includes(mode)) {
    throw new TypeError("Checkout identity mode is invalid.");
  }
  return authoritativeShipping || mode !== "member" ? "RON" : "EUR";
}

function serverShippingSelection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Shipping quote is invalid.");
  }
  const quoteId = text(input.quoteId);
  const carrier = text(input.carrier);
  const service = text(input.service);
  const currency = text(input.currency).toUpperCase();
  const estimate = input.estimate;
  if (
    !quoteId ||
    !carrier ||
    !service ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 0 ||
    currency !== "RON" ||
    !estimate ||
    !Number.isSafeInteger(estimate.minimumDays) ||
    !Number.isSafeInteger(estimate.maximumDays) ||
    estimate.minimumDays < 0 ||
    estimate.maximumDays < estimate.minimumDays ||
    !Number.isFinite(new Date(input.quotedAt).getTime()) ||
    !Number.isFinite(new Date(input.expiresAt).getTime())
  ) {
    throw new TypeError("Shipping quote is invalid.");
  }
  return {
    quoteId,
    carrier,
    service,
    amountMinor: input.amountMinor,
    currency,
    estimate: {
      minimumDays: estimate.minimumDays,
      maximumDays: estimate.maximumDays,
    },
    quotedAt: new Date(input.quotedAt).toISOString(),
    expiresAt: new Date(input.expiresAt).toISOString(),
  };
}

function authoritativeShippingCheckoutFields(quote) {
  return { shippingSelection: serverShippingSelection(quote) };
}

function membershipShippingReservationFields(input, quote) {
  const membershipDocumentId = text(input?.membershipDocumentId);
  const idempotencyKey = text(input?.idempotencyKey);
  if (!membershipDocumentId || !idempotencyKey) {
    throw new TypeError("Membership checkout identity is required.");
  }
  return {
    membershipDocumentId,
    idempotencyKey,
    ...authoritativeShippingCheckoutFields(quote),
  };
}

module.exports = {
  CHECKOUT_STEPS,
  authoritativeShippingCheckoutFields,
  checkoutFeatureMode,
  checkoutIdentity,
  checkoutPaymentCurrency,
  checkoutWizardReducer,
  initialCheckoutWizardState,
  membershipShippingReservationFields,
  serverShippingSelection,
};
