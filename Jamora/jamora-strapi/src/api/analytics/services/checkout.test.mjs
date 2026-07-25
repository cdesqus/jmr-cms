import assert from "node:assert/strict";
import test from "node:test";

import {
  computeLegacyPricing,
  computeAuthoritativePricing,
  computePaymentOrderPricing,
  applyAuthoritativeRonShipping,
  createDemoPriceSnapshot,
  legacyShippingAddressText,
  normalizeShippingAddressPayload,
} from "./checkout.ts";

test("authoritative RON shipping replaces fixed checkout delivery without browser money authority", () => {
  const pricing = computeAuthoritativePricing({
    body: {
      items: [{ slug: "tea", qty: 1 }],
      subtotalCents: 1,
      shippingCents: 1,
      discountCents: 1,
    },
    products: [{
      documentId: "p1",
      slug: "tea",
      sku: "TEA",
      name: "Tea",
      priceCents: 3000,
    }],
    discountCents: 500,
  });
  const shipping = {
    quoteId: `shq_${"A".repeat(43)}`,
    carrier: "jamora-mock",
    service: "standard",
    amountMinor: 2090,
    currency: "RON",
    estimate: { minimumDays: 2, maximumDays: 3 },
    quotedAt: "2026-07-25T10:00:00.000Z",
    expiresAt: "2026-07-25T10:15:00.000Z",
    addressDigest: "a".repeat(64),
    itemsDigest: "b".repeat(64),
    totalWeightGrams: 90,
    zone: "regional",
  };

  assert.deepEqual(
    applyAuthoritativeRonShipping(pricing, shipping, {
      rate: "4.975000",
      capturedAt: "2026-07-25T10:00:00.000Z",
    }),
    {
      pricing: {
        ...pricing,
        shippingCents: 420,
        totalCents: 2920,
      },
      priceSnapshot: {
        reference: { amountMinor: 2920, currency: "EUR" },
        charge: { amountMinor: 14527, currency: "RON" },
        rate: "4.975000",
        source: "demo-config",
        capturedAt: "2026-07-25T10:00:00.000Z",
        items: [{
          productDocumentId: "p1",
          slug: "tea",
          sku: "TEA",
          name: "Tea",
          qty: 1,
          unitPriceMinor: 14925,
          lineTotalMinor: 14925,
          currency: "RON",
        }],
        shipping,
        breakdown: {
          subtotalMinor: 14925,
          shippingMinor: 2090,
          discountMinor: 2488,
          totalMinor: 14527,
          currency: "RON",
        },
      },
    },
  );
});

test("authoritative RON shipping requires a safe signed RON snapshot", () => {
  const pricing = {
    items: [],
    subtotalCents: 1000,
    shippingCents: 495,
    discountCents: 0,
    totalCents: 1495,
  };
  for (const shipping of [
    null,
    { amountMinor: -1, currency: "RON" },
    { amountMinor: 100, currency: "EUR" },
    { amountMinor: 100, currency: "RON", quoteId: "forged" },
  ]) {
    assert.throws(
      () => applyAuthoritativeRonShipping(pricing, shipping),
      /shipping snapshot/i,
    );
  }
});

test("legacy shippingAddress.address remains a text address", () => {
  assert.deepEqual(
    normalizeShippingAddressPayload(
      { address: "Strada Veche 1, București" },
      undefined,
    ),
    {
      shippingAddress: undefined,
      shippingAddressText: "Strada Veche 1, București",
    },
  );
});

test("legacy customer address keeps precedence over shippingAddress.address", () => {
  assert.equal(
    legacyShippingAddressText(
      { address: "Shipping fallback" },
      "Customer address",
    ),
    "Customer address",
  );
});

test("disabled checkout preserves legacy totals and omits structured persistence", () => {
  assert.deepEqual(
    computeLegacyPricing({
      subtotalCents: 1234.5,
      shippingCents: 77.25,
      items: [{ slug: "tea", qty: 1.6, unitPriceCents: 10.4, lineTotalCents: 17.8 }],
    }, 100),
    {
      items: [{
        productId: "",
        sku: "",
        slug: "tea",
        name: "Product",
        qty: 2,
        unitPriceCents: 10,
        lineTotalCents: 18,
      }],
      subtotalCents: 1234.5,
      shippingCents: 77.25,
      discountCents: 100,
      totalCents: 1211.75,
      shippingAddress: undefined,
      anonymousSessionId: undefined,
      priceSnapshot: undefined,
    },
  );
});

test("authoritative product prices replace tampered browser totals", () => {
  assert.deepEqual(
    computeAuthoritativePricing({
      body: {
        subtotalCents: 1,
        shippingCents: 0,
        discountCents: 0,
        items: [{
          slug: "tea",
          qty: 2,
          unitPriceCents: 1,
          lineTotalCents: 2,
        }],
      },
      products: [{ documentId: "p1", slug: "tea", sku: "TEA", name: "Tea", priceCents: 3000 }],
      discountCents: 0,
    }),
    {
      items: [{
        productId: "p1",
        slug: "tea",
        sku: "TEA",
        name: "Tea",
        qty: 2,
        unitPriceCents: 3000,
        lineTotalCents: 6000,
      }],
      subtotalCents: 6000,
      shippingCents: 0,
      discountCents: 0,
      totalCents: 6000,
    },
  );
});

test("pending payments use authoritative prices even when structured checkout is off", () => {
  const body = {
    subtotalCents: 1,
    shippingCents: 0,
    items: [{
      slug: "tea",
      qty: 1,
      unitPriceCents: 1,
      lineTotalCents: 1,
    }],
  };
  assert.deepEqual(
    computePaymentOrderPricing({
      body,
      products: [{
        documentId: "p1",
        slug: "tea",
        sku: "TEA",
        name: "Tea",
        priceCents: 3000,
      }],
      discountCents: 0,
      pendingPayment: true,
      structuredCheckoutEnabled: false,
    }),
    {
      items: [{
        productId: "p1",
        slug: "tea",
        sku: "TEA",
        name: "Tea",
        qty: 1,
        unitPriceCents: 3000,
        lineTotalCents: 3000,
      }],
      subtotalCents: 3000,
      shippingCents: 495,
      discountCents: 0,
      totalCents: 3495,
    },
  );
  assert.throws(
    () => computePaymentOrderPricing({
      body,
      products: [],
      discountCents: 0,
      pendingPayment: true,
      structuredCheckoutEnabled: false,
    }),
    /unknown product/i,
  );
});

test("rejects fractional, negative, unsafe, and unknown product inputs", () => {
  const product = [{ documentId: "p1", slug: "tea", priceCents: 3000 }];
  for (const [field, value] of [
    ["subtotalCents", 1.5],
    ["shippingCents", -1],
    ["discountCents", Number.MAX_SAFE_INTEGER + 1],
  ]) {
    assert.throws(
      () => computeAuthoritativePricing({
        body: { [field]: value, items: [{ slug: "tea", qty: 1 }] },
        products: product,
        discountCents: 0,
      }),
      /non-negative safe integer/,
    );
  }
  assert.throws(
    () => computeAuthoritativePricing({
      body: { items: [{ slug: "missing", qty: 1 }] },
      products: product,
      discountCents: 0,
    }),
    /Unknown product/,
  );
});

test("authoritative promotion discount and FX snapshot use the same total", () => {
  const pricing = computeAuthoritativePricing({
    body: { items: [{ slug: "tea", qty: 2 }] },
    products: [{ documentId: "p1", slug: "tea", priceCents: 3000 }],
    discountCents: 750,
  });
  assert.equal(pricing.discountCents, 750);
  assert.equal(pricing.totalCents, 5250);
  assert.equal(
    createDemoPriceSnapshot(pricing.totalCents, {
      rate: "4.975000",
      capturedAt: "2026-07-24T00:00:00.000Z",
    }).reference.amountMinor,
    pricing.totalCents,
  );
});
