"use strict";

const CHECKOUT_STEPS = Object.freeze([
  "contact",
  "address",
  "delivery",
  "payment",
  "review",
]);
const ADDRESS_DIGEST_FIELDS = Object.freeze([
  "recipient",
  "phone",
  "countryCode",
  "subdivisionCode",
  "locality",
  "postalCode",
  "street",
  "building",
  "unit",
  "instructions",
]);
const ADDRESS_WARNING_MESSAGES = Object.freeze({
  "postalCode is not recognized": "The postal code could not be verified.",
  "subdivisionCode is not recognized": "The county could not be verified.",
  "postalCode does not match subdivisionCode":
    "The postal code and county do not appear to match.",
  "locality could not be verified for discounted shipping zone":
    "The locality could not be verified for this postal zone.",
  "locality does not match subdivisionCode":
    "The locality and county do not appear to match.",
  "locality does not match postalCode":
    "The locality and postal code do not appear to match.",
});

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
      return {
        ...state,
        reservationCapability: text(
          typeof action.value === "object"
            ? action.value?.token
            : action.value,
        ),
        reservationCapabilityExpiresAt: text(
          typeof action.value === "object"
            ? action.value?.expiresAt
            : "",
        ),
      };
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

function checkoutCompletionMode(input) {
  if (!["guest", "customer", "member"].includes(input?.mode)) {
    throw new TypeError("Checkout identity mode is invalid.");
  }
  return input.paymentsEnabled === true ? "payment_pending" : "legacy_sync";
}

function shouldAssessCheckoutAddress(input) {
  return input?.addressAssistEnabled === true ||
    input?.shippingEnabled === true;
}

function checkoutInputDigest(address, items) {
  const safeAddress = {};
  for (const field of ADDRESS_DIGEST_FIELDS) {
    safeAddress[field] = text(address?.[field]);
  }
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item) => ({ slug: text(item?.slug), qty: item?.qty }))
    .sort((left, right) =>
      left.slug.localeCompare(right.slug) || left.qty - right.qty);
  return JSON.stringify({ address: safeAddress, items: safeItems });
}

function liveAfter(value, now) {
  const instant = new Date(value).getTime();
  return Number.isFinite(instant) && instant > now.getTime();
}

function canRetainCheckoutQuote(input) {
  const now = input?.now instanceof Date ? input.now : new Date();
  return Boolean(
    input?.selectedQuote &&
    input.selectedDigest &&
    input.selectedDigest === input.nextDigest &&
    liveAfter(input.selectedQuote.expiresAt, now) &&
    (!input.capabilityExpiresAt ||
      liveAfter(input.capabilityExpiresAt, now)),
  );
}

function createSingleFlight() {
  let current;
  return {
    run(operation) {
      if (current) return current;
      let result;
      try {
        result = operation();
      } catch (error) {
        throw error;
      }
      const tracked = Promise.resolve(result).finally(() => {
        if (current === tracked) current = undefined;
      });
      current = tracked;
      return tracked;
    },
    busy() {
      return Boolean(current);
    },
  };
}

function addressWarningMessage(warning) {
  const code = text(warning);
  return ADDRESS_WARNING_MESSAGES[code] ?? code;
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
  addressWarningMessage,
  authoritativeShippingCheckoutFields,
  canRetainCheckoutQuote,
  checkoutCompletionMode,
  checkoutFeatureMode,
  checkoutIdentity,
  checkoutInputDigest,
  checkoutPaymentCurrency,
  checkoutWizardReducer,
  createSingleFlight,
  initialCheckoutWizardState,
  membershipShippingReservationFields,
  serverShippingSelection,
  shouldAssessCheckoutAddress,
};
