/* eslint-disable @typescript-eslint/no-require-imports */
const {
  normaliseRomanianAddress,
  validateRomanianAddress,
} = require("./address.cjs");
const { createFxSnapshot } = require("./money.cjs");

const DEFAULT_DEMO_EUR_RON_RATE = "4.975000";
const ANONYMOUS_SESSION_KEY = "jamora.anonymous-session.v1";

function convertMinorUnits(eurMinor, rate) {
  if (!Number.isSafeInteger(eurMinor) || eurMinor < 0) {
    throw new TypeError("EUR minor amount must be a non-negative safe integer");
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!match) throw new TypeError("DEMO_EUR_RON_RATE must be a positive decimal");
  const decimals = match[2] ?? "";
  const denominator = 10n ** BigInt(decimals.length);
  const numerator = BigInt(match[1]) * denominator + BigInt(decimals || "0");
  if (numerator <= 0n) throw new TypeError("DEMO_EUR_RON_RATE must be positive");
  const rounded = (BigInt(eurMinor) * numerator + denominator / 2n) / denominator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Converted RON amount exceeds safe integer range");
  }
  return Number(rounded);
}

function createDemoPriceSnapshot(eurMinor, options = {}) {
  const rate = String(options.rate ?? process.env.DEMO_EUR_RON_RATE ?? DEFAULT_DEMO_EUR_RON_RATE);
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  return createFxSnapshot({
    eurMinor,
    ronMinor: convertMinorUnits(eurMinor, rate),
    rate,
    source: "demo-config",
    capturedAt,
  });
}

function getOrCreateAnonymousSessionId(storage, randomUUID) {
  let id = storage.getItem(ANONYMOUS_SESSION_KEY);
  if (!id) {
    id = randomUUID();
    storage.setItem(ANONYMOUS_SESSION_KEY, id);
  }
  return id;
}

function guestShippingCents(subtotalCents) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new TypeError("subtotalCents must be a non-negative safe integer");
  }
  return subtotalCents >= 5000 ? 0 : 495;
}

function formatRomanianAddress(address) {
  const unit = address.unit ? `, ap. ${address.unit}` : "";
  const county = address.subdivisionCode ? `, ${address.subdivisionCode}` : "";
  const phone = address.phone ? `\nTelefon: ${address.phone}` : "";
  const instructions = address.instructions
    ? `\nInstrucțiuni: ${address.instructions}`
    : "";
  return `${address.recipient}\n${address.street} ${address.building}${unit}\n${address.postalCode} ${address.locality}${county}\nRomania${phone}${instructions}`;
}

function isStructuredAddress(value) {
  if (!value || typeof value !== "object") return false;
  return ["recipient", "locality", "postalCode", "street", "building", "countryCode"]
    .some((field) => Object.hasOwn(value, field));
}

function normalizeCheckoutPayload(body, options = {}) {
  const result = { ...body, customer: { ...(body.customer ?? {}) } };
  if (typeof body.anonymousSessionId === "string" && body.anonymousSessionId.trim()) {
    result.anonymousSessionId = body.anonymousSessionId.trim();
  } else {
    delete result.anonymousSessionId;
  }

  if (isStructuredAddress(body.shippingAddress)) {
    const shippingAddress = normaliseRomanianAddress(body.shippingAddress);
    const errors = validateRomanianAddress(shippingAddress);
    if (errors.length) {
      throw new TypeError(`Invalid shipping address: ${errors.join(", ")}`);
    }
    result.shippingAddress = shippingAddress;
    result.customer.address = formatRomanianAddress(shippingAddress);
  } else {
    const legacyAddress = typeof body.shippingAddress?.address === "string"
      ? body.shippingAddress.address
      : result.customer.address;
    if (typeof legacyAddress === "string") result.customer.address = legacyAddress;
  }

  const subtotal = Number.isSafeInteger(body.subtotalCents) ? Math.max(0, body.subtotalCents) : 0;
  const shipping = Number.isSafeInteger(body.shippingCents) ? Math.max(0, body.shippingCents) : 0;
  const discount = Number.isSafeInteger(body.discountCents) ? Math.max(0, body.discountCents) : 0;
  result.priceSnapshot = createDemoPriceSnapshot(
    Math.max(0, subtotal - discount + shipping),
    options,
  );
  return result;
}

function prepareCheckoutPayloadText(raw, structuredCheckoutEnabled, options = {}) {
  if (!structuredCheckoutEnabled) return raw;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Checkout payload must be an object");
  }
  return JSON.stringify(normalizeCheckoutPayload(parsed, options));
}

module.exports = {
  DEFAULT_DEMO_EUR_RON_RATE,
  createDemoPriceSnapshot,
  formatRomanianAddress,
  getOrCreateAnonymousSessionId,
  guestShippingCents,
  isStructuredAddress,
  normalizeCheckoutPayload,
  prepareCheckoutPayloadText,
};
