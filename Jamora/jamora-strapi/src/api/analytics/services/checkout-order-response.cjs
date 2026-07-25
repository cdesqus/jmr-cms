"use strict";

const ADDRESS_FIELDS = [
  "recipient", "phone", "countryCode", "subdivisionCode", "locality",
  "postalCode", "street", "building", "unit", "instructions",
];
const QUOTE_FIELDS = [
  "quoteId", "carrier", "service", "amountMinor", "currency",
  "estimate", "quotedAt", "expiresAt",
];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Authoritative ${label} is invalid.`);
  }
  return value;
}

function pick(source, fields) {
  const result = {};
  for (const field of fields) {
    if (source?.[field] !== undefined) {
      result[field] = structuredClone(source[field]);
    }
  }
  return result;
}

function safeQuote(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return pick(value, QUOTE_FIELDS);
}

function safeMoney(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const currency = text(value.currency).toUpperCase();
  if (!currency) throw new Error(`Authoritative ${label} currency is invalid.`);
  return {
    amountMinor: safeInteger(value.amountMinor, `${label} amount`),
    currency,
  };
}

function safeBreakdown(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return {
    subtotalMinor: safeInteger(value.subtotalMinor, "subtotal"),
    shippingMinor: safeInteger(value.shippingMinor, "shipping"),
    discountMinor: safeInteger(value.discountMinor, "discount"),
    totalMinor: safeInteger(value.totalMinor, "total"),
    currency: text(value.currency).toUpperCase(),
  };
}

function safeCheckoutOrder(order) {
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    throw new Error("Authoritative checkout order is unavailable.");
  }
  const quote = safeQuote(
    order.shippingSnapshot?.quote ?? order.priceSnapshot?.shipping,
  );
  const breakdown = safeBreakdown(order.priceSnapshot?.breakdown);
  const reference = safeMoney(order.priceSnapshot?.reference, "reference");
  const charge = safeMoney(order.priceSnapshot?.charge, "charge");
  let currency;
  let totals;
  if (quote) {
    if (!breakdown || breakdown.currency !== "RON") {
      throw new Error("Authoritative RON checkout breakdown is unavailable.");
    }
    if (quote.currency !== "RON" ||
        safeInteger(quote.amountMinor, "shipping quote") !==
          breakdown.shippingMinor ||
        !charge ||
        charge.currency !== "RON" ||
        charge.amountMinor !== breakdown.totalMinor) {
      throw new Error("Authoritative RON checkout snapshot is inconsistent.");
    }
    currency = "RON";
    totals = {
      subtotalCents: safeInteger(breakdown.subtotalMinor, "subtotal"),
      shippingCents: safeInteger(breakdown.shippingMinor, "shipping"),
      discountCents: safeInteger(breakdown.discountMinor, "discount"),
      totalCents: safeInteger(breakdown.totalMinor, "total"),
    };
    if (
      totals.subtotalCents - totals.discountCents + totals.shippingCents !==
      totals.totalCents
    ) {
      throw new Error("Authoritative RON checkout breakdown is inconsistent.");
    }
  } else {
    currency = text(order.currency).toUpperCase() || "EUR";
    totals = {
      subtotalCents: safeInteger(order.subtotalCents, "subtotal"),
      shippingCents: safeInteger(order.shippingCents, "shipping"),
      discountCents: safeInteger(order.discountCents ?? 0, "discount"),
      totalCents: safeInteger(order.totalCents, "total"),
    };
  }
  const shippingAddress = order.shippingAddress &&
    typeof order.shippingAddress === "object" &&
    !Array.isArray(order.shippingAddress)
    ? pick(order.shippingAddress, ADDRESS_FIELDS)
    : undefined;
  const items = (Array.isArray(order.items) ? order.items : []).map((item) => ({
    productId: text(item?.productId ?? item?.productDocumentId),
    slug: text(item?.slug),
    sku: text(item?.sku),
    name: text(item?.name),
    qty: safeInteger(item?.qty, "item quantity"),
    unitPriceCents: safeInteger(
      item?.unitPriceCents ?? item?.unitPriceMinor ?? 0,
      "item unit price",
    ),
    lineTotalCents: safeInteger(
      item?.lineTotalCents ??
        (item?.unitPriceCents ?? item?.unitPriceMinor ?? 0) * item?.qty,
      "item line total",
    ),
  }));
  const safePriceSnapshot = order.priceSnapshot
    ? {
        ...(reference ? { reference } : {}),
        ...(charge ? { charge } : {}),
        ...(text(order.priceSnapshot.rate)
          ? { rate: text(order.priceSnapshot.rate) }
          : {}),
        ...(text(order.priceSnapshot.source)
          ? { source: text(order.priceSnapshot.source) }
          : {}),
        ...(text(order.priceSnapshot.capturedAt)
          ? { capturedAt: text(order.priceSnapshot.capturedAt) }
          : {}),
        ...(quote ? { shipping: quote } : {}),
        ...(breakdown ? { breakdown } : {}),
      }
    : undefined;
  const documentId = text(order.documentId);
  return {
    id: documentId || text(order.orderNumber),
    ...(documentId ? { documentId } : {}),
    orderNumber: text(order.orderNumber),
    trackingNumber: text(order.trackingNumber),
    status: text(order.status),
    carrier: quote?.carrier ?? text(order.carrier),
    ...(quote?.service ? { service: quote.service } : {}),
    currency,
    customer: {
      name: text(order.customerName),
      email: text(order.email),
      address: text(order.shippingAddressText),
    },
    ...(shippingAddress ? { shippingAddress } : {}),
    items,
    ...totals,
    ...(text(order.promotionCode)
      ? { promotionCode: text(order.promotionCode) }
      : {}),
    createdAt: text(order.createdAt) || new Date().toISOString(),
    ...(quote?.estimate
      ? { shippingEstimate: structuredClone(quote.estimate) }
      : {}),
    ...(safePriceSnapshot ? { priceSnapshot: safePriceSnapshot } : {}),
  };
}

module.exports = { safeCheckoutOrder };
