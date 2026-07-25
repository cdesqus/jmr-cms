"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash, createHmac, timingSafeEqual } = require("node:crypto");

const ADDRESS_FIELDS = [
  "recipient", "phone", "countryCode", "subdivisionCode", "locality",
  "postalCode", "street", "building", "unit", "instructions",
];
const SUGGESTION_FIELDS = [
  "countryCode", "subdivisionCode", "locality", "postalCode", "street", "building",
];
const QUOTE_ID = /^shq_[A-Za-z0-9_-]{20,100}$/;
const RESERVATION_CAPABILITY =
  /^rsv_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GUEST_RATE_LIMIT = 30;
const GUEST_RATE_WINDOW_MS = 60_000;
const GUEST_RATE_MAX_BUCKETS = 2_000;
const guestRateWindows = new Map();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createGuestCapabilityProof(secret, capability) {
  const trustedSecret = text(secret);
  const trustedCapability = text(capability);
  if (!trustedSecret || !RESERVATION_CAPABILITY.test(trustedCapability)) {
    throw new Error("Guest checkout capability proof is unavailable.");
  }
  return createHmac("sha256", trustedSecret)
    .update(`shipping-capability\0${trustedCapability}`)
    .digest("hex");
}

function hasGuestCapabilityProof(secret, capability, proof) {
  try {
    const expected = Buffer.from(
      createGuestCapabilityProof(secret, capability),
      "utf8",
    );
    const supplied = Buffer.from(text(proof), "utf8");
    return supplied.length === expected.length &&
      timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

function guestCapabilityRateAllowed(capability, now = Date.now()) {
  const trustedCapability = text(capability);
  if (!RESERVATION_CAPABILITY.test(trustedCapability) ||
      !Number.isFinite(now)) return false;
  const key = createHash("sha256").update(trustedCapability).digest("hex");
  const existing = guestRateWindows.get(key);
  const window = !existing || now - existing.startedAt >= GUEST_RATE_WINDOW_MS
    ? { startedAt: now, count: 0 }
    : existing;
  window.count += 1;
  guestRateWindows.set(key, window);
  if (guestRateWindows.size > GUEST_RATE_MAX_BUCKETS) {
    for (const [candidate, value] of guestRateWindows) {
      if (now - value.startedAt >= GUEST_RATE_WINDOW_MS) {
        guestRateWindows.delete(candidate);
      }
    }
    while (guestRateWindows.size > GUEST_RATE_MAX_BUCKETS) {
      guestRateWindows.delete(guestRateWindows.keys().next().value);
    }
  }
  return window.count <= GUEST_RATE_LIMIT;
}

function record(value, message = "Invalid request.") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(message);
  }
  return value;
}

function customerShippingPath(method, path) {
  const key = Array.isArray(path) ? path.join("/") : "";
  const targets = {
    "address/suggest": "/api/jamora/address/suggest",
    "address/assess": "/api/jamora/address/assess",
    "shipping/quotes": "/api/jamora/shipping/quotes",
    "shipping/select": "/api/jamora/shipping/select",
  };
  if (method !== "POST" || !Object.hasOwn(targets, key)) {
    throw new Error("Not found.");
  }
  return targets[key];
}

function shippingOperationEnabled(operation, env) {
  return operation.startsWith("address/")
    ? env?.ADDRESS_ASSIST_ENABLED === "true"
    : operation.startsWith("shipping/")
      ? env?.SHIPPING_ENABLED === "true"
      : false;
}

function trustedShippingHeaders(inputHeaders, secret, customer, guestCapability) {
  const storefrontSecret = text(secret);
  if (!storefrontSecret) throw new Error("Shipping service unavailable.");
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-jamora-storefront-secret", storefrontSecret);
  const documentId = text(customer?.documentId);
  if (documentId) {
    if (!Number.isSafeInteger(customer?.sessionVersion) || customer.sessionVersion < 0) {
      throw new Error("Validated customer session is required.");
    }
    headers.set("x-jamora-customer-document-id", documentId);
    headers.set("x-jamora-customer-session-version", String(customer.sessionVersion));
  } else {
    const capability = text(guestCapability);
    if (!RESERVATION_CAPABILITY.test(capability)) {
      throw new Error("Guest checkout capability is required.");
    }
    headers.set("x-jamora-checkout-capability", capability);
  }
  return headers;
}

function safeAddress(value, fields = ADDRESS_FIELDS) {
  const input = record(value, "Invalid address response.");
  return Object.fromEntries(fields.map((field) => [field, text(input[field])]));
}

function safeQuote(value) {
  const input = record(value, "Invalid shipping quote response.");
  const quoteId = text(input.quoteId);
  const carrier = text(input.carrier);
  const service = text(input.service);
  const currency = text(input.currency).toUpperCase();
  const estimate = record(input.estimate, "Invalid shipping quote response.");
  const quotedAt = new Date(input.quotedAt);
  const expiresAt = new Date(input.expiresAt);
  if (
    !QUOTE_ID.test(quoteId) ||
    !carrier ||
    !service ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 0 ||
    currency !== "RON" ||
    !Number.isSafeInteger(estimate.minimumDays) ||
    estimate.minimumDays < 0 ||
    !Number.isSafeInteger(estimate.maximumDays) ||
    estimate.maximumDays < estimate.minimumDays ||
    !Number.isFinite(quotedAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= quotedAt
  ) {
    throw new Error("Invalid shipping quote response.");
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
    quotedAt: quotedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function safeAddressSuggestions(value) {
  const input = record(value, "Invalid address response.");
  if (!Array.isArray(input.suggestions) || input.suggestions.length > 8) {
    throw new Error("Invalid address response.");
  }
  return {
    suggestions: input.suggestions.map((suggestion) =>
      safeAddress(suggestion, SUGGESTION_FIELDS)),
  };
}

function safeAddressAssessment(value) {
  const input = record(value, "Invalid address response.");
  if (!Array.isArray(input.errors) || !Array.isArray(input.warnings)) {
    throw new Error("Invalid address response.");
  }
  const errors = input.errors.map(text);
  const warnings = input.warnings.map(text);
  if (errors.some((item) => !item) || warnings.some((item) => !item)) {
    throw new Error("Invalid address response.");
  }
  return {
    address: safeAddress(input.address),
    errors,
    warnings,
  };
}

function safeShippingQuotes(value) {
  const input = record(value, "Invalid shipping quote response.");
  if (!Array.isArray(input.quotes) || input.quotes.length < 1 || input.quotes.length > 10) {
    throw new Error("Invalid shipping quote response.");
  }
  return { quotes: input.quotes.map(safeQuote) };
}

function safeShippingSelection(value) {
  const input = record(value, "Invalid shipping quote response.");
  return {
    idempotent: input.idempotent === true,
    shipping: safeQuote(input.shipping),
  };
}

function quoteInput(value) {
  return safeQuote(value);
}

function shippingOperationBody(operation, value) {
  const input = record(value);
  if (operation === "address/suggest") {
    const query = text(input.query);
    if (!query || query.length > 200) throw new TypeError("Invalid address query.");
    return { query };
  }
  if (operation === "address/assess") {
    return { address: safeAddress(input.address) };
  }
  if (operation === "shipping/quotes") {
    if (!["order", "membership_checkout"].includes(input.subjectType)) {
      throw new TypeError("Invalid shipping subject.");
    }
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
      throw new TypeError("Invalid shipping items.");
    }
    const items = input.items.map((item) => {
      const candidate = record(item);
      const slug = text(candidate.slug);
      if (!slug || !Number.isSafeInteger(candidate.qty) || candidate.qty <= 0) {
        throw new TypeError("Invalid shipping items.");
      }
      return { slug, qty: candidate.qty };
    });
    return {
      subjectType: input.subjectType,
      address: safeAddress(input.address),
      items,
    };
  }
  if (operation === "shipping/select") {
    if (!["order", "membership_checkout"].includes(input.subjectType)) {
      throw new TypeError("Invalid shipping subject.");
    }
    const subjectId = text(input.subjectId);
    if (!subjectId) throw new TypeError("Invalid shipping subject.");
    return {
      subjectType: input.subjectType,
      subjectId,
      selection: quoteInput(input.selection),
      address: safeAddress(input.address),
    };
  }
  throw new Error("Not found.");
}

function safeShippingResponse(operation, value) {
  if (operation === "address/suggest") return safeAddressSuggestions(value);
  if (operation === "address/assess") return safeAddressAssessment(value);
  if (operation === "shipping/quotes") return safeShippingQuotes(value);
  if (operation === "shipping/select") return safeShippingSelection(value);
  throw new Error("Not found.");
}

module.exports = {
  createGuestCapabilityProof,
  customerShippingPath,
  guestCapabilityRateAllowed,
  hasGuestCapabilityProof,
  safeAddressAssessment,
  safeAddressSuggestions,
  safeShippingQuotes,
  safeShippingResponse,
  safeShippingSelection,
  shippingOperationEnabled,
  shippingOperationBody,
  trustedShippingHeaders,
};
