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

function safeEstimate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return {
    minimumDays: safeInteger(value.minimumDays, "minimum delivery estimate"),
    maximumDays: safeInteger(value.maximumDays, "maximum delivery estimate"),
  };
}

function safeQuote(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const quote = pick(value, QUOTE_FIELDS.filter((field) => field !== "estimate"));
  const estimate = safeEstimate(value.estimate);
  return {
    ...quote,
    ...(estimate ? { estimate } : {}),
  };
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
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const itemSource = quote ? order.priceSnapshot?.items : orderItems;
  if (quote && !Array.isArray(itemSource)) {
    throw new Error("Authoritative RON checkout items are unavailable.");
  }
  const items = (Array.isArray(itemSource) ? itemSource : []).map((item) => {
    if (quote && text(item?.currency).toUpperCase() !== "RON") {
      throw new Error("Authoritative RON checkout item currency is invalid.");
    }
    const qty = safeInteger(item?.qty, "item quantity");
    const unitPriceCents = safeInteger(
      quote ? item?.unitPriceMinor : item?.unitPriceCents ?? item?.unitPriceMinor ?? 0,
      "item unit price",
    );
    const lineTotalCents = safeInteger(
      quote ? item?.lineTotalMinor : item?.lineTotalCents ??
        (item?.unitPriceCents ?? item?.unitPriceMinor ?? 0) * item?.qty,
      "item line total",
    );
    if (quote && unitPriceCents * qty !== lineTotalCents) {
      throw new Error("Authoritative RON checkout item total is inconsistent.");
    }
    return {
      productId: text(item?.productId ?? item?.productDocumentId),
      slug: text(item?.slug),
      sku: text(item?.sku),
      name: text(item?.name),
      qty,
      unitPriceCents,
      lineTotalCents,
    };
  });
  if (quote) {
    if (items.length !== orderItems.length) {
      throw new Error("Authoritative RON checkout item binding is invalid.");
    }
    const originalBySlug = new Map(orderItems.map((item) => [
      text(item?.slug),
      {
        productId: text(item?.productId ?? item?.productDocumentId),
        qty: item?.qty,
      },
    ]));
    for (const item of items) {
      const original = originalBySlug.get(item.slug);
      if (!original ||
          original.productId !== item.productId ||
          original.qty !== item.qty) {
        throw new Error("Authoritative RON checkout item binding is invalid.");
      }
    }
    const itemSubtotal = items.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0,
    );
    if (!Number.isSafeInteger(itemSubtotal) ||
        itemSubtotal !== breakdown.subtotalMinor) {
      throw new Error("Authoritative RON checkout item subtotal is inconsistent.");
    }
  }
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
        ...(quote
          ? {
              items: items.map((item) => ({
                productDocumentId: item.productId,
                slug: item.slug,
                sku: item.sku,
                name: item.name,
                qty: item.qty,
                unitPriceMinor: item.unitPriceCents,
                lineTotalMinor: item.lineTotalCents,
                currency: "RON",
              })),
            }
          : {}),
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
      ? { shippingEstimate: quote.estimate }
      : {}),
    ...(safePriceSnapshot ? { priceSnapshot: safePriceSnapshot } : {}),
  };
}

module.exports = { safeCheckoutOrder };
