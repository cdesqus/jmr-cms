import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAuthoritativePricing,
  normalizeShippingAddressPayload,
} from "./checkout.ts";

test("legacy shippingAddress.address remains a text address", () => {
  assert.deepEqual(
    normalizeShippingAddressPayload(
      { address: "Strada Veche 1, București" },
      "",
    ),
    {
      shippingAddress: undefined,
      shippingAddressText: "Strada Veche 1, București",
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
