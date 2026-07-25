"use strict";

const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const {
  deriveRomanianShippingZone,
  parseAuthoritativeWeightGrams,
  quoteMockShippingServices,
} = require("./shipping-adapter.cjs");
const {
  assessRomanianAddress,
} = require("./address-domain.cjs");

const QUOTE_TTL_MS = 15 * 60 * 1_000;
const QUOTE_VERSION = 1;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function secret(value) {
  const result = text(value);
  if (Buffer.byteLength(result, "utf8") < 32) {
    throw new Error("Shipping quote secret must contain at least 32 bytes.");
  }
  return result;
}

function instant(value, name) {
  const result = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new TypeError(`${name} is invalid.`);
  return result;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function authoritativeAddress(input) {
  const assessed = assessRomanianAddress(input);
  if (assessed.errors.length) {
    throw new TypeError(`Invalid shipping address: ${assessed.errors.join(", ")}.`);
  }
  return assessed.address;
}

function positive(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function authoritativeItemContext(items, products) {
  if (!Array.isArray(items) || !items.length) throw new TypeError("Shipping items are required.");
  const productBySlug = new Map(
    (Array.isArray(products) ? products : [])
      .map((product) => [text(product?.slug), product])
      .filter(([slug]) => slug),
  );
  const slugs = new Set();
  const authoritativeItems = items.map((requested) => {
    const slug = text(requested?.slug);
    const qty = positive(requested?.qty, "qty");
    if (!slug || slugs.has(slug)) throw new TypeError("Shipping item slugs must be unique.");
    slugs.add(slug);
    const product = productBySlug.get(slug);
    if (!product) throw new TypeError(`Unknown shipping product: ${slug || "(missing)"}.`);
    const weightGrams = parseAuthoritativeWeightGrams(product);
    const lineWeightGrams = weightGrams * qty;
    if (!Number.isSafeInteger(lineWeightGrams) || lineWeightGrams <= 0) {
      throw new RangeError("Shipping item weight exceeds safe integer range.");
    }
    return {
      productDocumentId: text(product.documentId),
      slug,
      qty,
      weightGrams,
      lineWeightGrams,
    };
  }).sort((left, right) =>
    left.productDocumentId.localeCompare(right.productDocumentId) ||
    left.slug.localeCompare(right.slug));
  let totalWeightGrams = 0;
  for (const item of authoritativeItems) {
    totalWeightGrams += item.lineWeightGrams;
    if (!Number.isSafeInteger(totalWeightGrams)) {
      throw new RangeError("Total shipping weight exceeds safe integer range.");
    }
  }
  return { authoritativeItems, totalWeightGrams };
}

function quoteIdentity(quote, context) {
  return {
    version: QUOTE_VERSION,
    carrier: quote.carrier,
    service: quote.service,
    amountMinor: quote.amountMinor,
    currency: quote.currency,
    estimate: quote.estimate,
    quotedAt: quote.quotedAt,
    expiresAt: quote.expiresAt,
    addressDigest: context.addressDigest,
    itemsDigest: context.itemsDigest,
  };
}

function quoteId(identity, quoteSecret) {
  return `shq_${crypto.createHmac("sha256", quoteSecret)
    .update(canonical(identity), "utf8")
    .digest("base64url")}`;
}

function safeQuote(quote, context, quoteSecret) {
  const identity = quoteIdentity(quote, context);
  return { quoteId: quoteId(identity, quoteSecret), ...quote };
}

function contextFor(input) {
  const address = authoritativeAddress(input.address);
  const items = authoritativeItemContext(input.items, input.products);
  const zone = deriveRomanianShippingZone(address);
  return {
    address,
    addressDigest: digest(address),
    itemsDigest: digest(items.authoritativeItems),
    totalWeightGrams: items.totalWeightGrams,
    zone,
  };
}

function quoteShipping(input, options = {}) {
  const quoteSecret = secret(options.secret);
  const now = instant(options.now ?? new Date(), "now");
  const ttlMs = options.ttlMs ?? QUOTE_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs !== QUOTE_TTL_MS) {
    throw new TypeError("Shipping quote TTL must be exactly 15 minutes.");
  }
  const context = contextFor(input);
  const quotedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  return quoteMockShippingServices(context).map((rate) => safeQuote({
    ...rate,
    estimate: { ...rate.estimate },
    quotedAt,
    expiresAt,
  }, context, quoteSecret));
}

function selectedExpected(input, options) {
  const selection = input.selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new TypeError("Shipping quote is invalid.");
  }
  const quotedAt = instant(selection.quotedAt, "shipping quote time");
  const expiresAt = instant(selection.expiresAt, "shipping quote expiry");
  if (expiresAt.getTime() - quotedAt.getTime() !== QUOTE_TTL_MS) {
    throw new Error("Shipping quote is invalid.");
  }
  const now = instant(options.now ?? new Date(), "now");
  if (now >= expiresAt) throw new Error("Shipping quote expired.");
  const generated = quoteShipping(input, { ...options, now: quotedAt });
  const expected = generated.find((quote) => quote.service === selection.service);
  if (!expected) throw new Error("Shipping quote is invalid.");
  const expectedId = Buffer.from(expected.quoteId, "utf8");
  const suppliedId = Buffer.from(text(selection.quoteId), "utf8");
  const idMatches = suppliedId.length === expectedId.length &&
    crypto.timingSafeEqual(suppliedId, expectedId);
  const { quoteId: expectedQuoteId, ...expectedFields } = expected;
  const { quoteId: suppliedQuoteId, ...suppliedFields } = selection;
  if (!idMatches || !expectedQuoteId || !suppliedQuoteId ||
      !isDeepStrictEqual(expectedFields, suppliedFields)) {
    throw new Error("Shipping quote is invalid.");
  }
  return { expected, context: contextFor(input) };
}

function selectShippingQuote(input, options = {}) {
  const { expected, context } = selectedExpected(input, options);
  const snapshot = {
    version: QUOTE_VERSION,
    quoteId: expected.quoteId,
    carrier: expected.carrier,
    service: expected.service,
    amountMinor: expected.amountMinor,
    currency: expected.currency,
    estimate: { ...expected.estimate },
    quotedAt: expected.quotedAt,
    expiresAt: expected.expiresAt,
    addressDigest: context.addressDigest,
    itemsDigest: context.itemsDigest,
    totalWeightGrams: context.totalWeightGrams,
    zone: context.zone,
  };
  if (input.existingSnapshot !== undefined) {
    if (!isDeepStrictEqual(input.existingSnapshot, snapshot)) {
      throw new Error("Shipping selection idempotency conflict.");
    }
    return { snapshot: structuredClone(input.existingSnapshot), idempotent: true };
  }
  return { snapshot, idempotent: false };
}

function validateShippingSnapshot(input, options = {}) {
  const snapshot = input.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Shipping snapshot binding changed.");
  }
  let selected;
  try {
    selected = selectShippingQuote({
      selection: {
        quoteId: snapshot.quoteId,
        carrier: snapshot.carrier,
        service: snapshot.service,
        amountMinor: snapshot.amountMinor,
        currency: snapshot.currency,
        estimate: snapshot.estimate,
        quotedAt: snapshot.quotedAt,
        expiresAt: snapshot.expiresAt,
      },
      address: input.address,
      items: input.items,
      products: input.products,
    }, options).snapshot;
  } catch (error) {
    if (/expired/i.test(error?.message)) throw error;
    throw new Error("Shipping snapshot binding changed.");
  }
  if (!isDeepStrictEqual(snapshot, selected)) {
    throw new Error("Shipping snapshot binding changed.");
  }
  return structuredClone(snapshot);
}

module.exports = {
  QUOTE_TTL_MS,
  quoteShipping,
  selectShippingQuote,
  validateShippingSnapshot,
};
