import assert from "node:assert/strict";
import test from "node:test";
import {
  safeCheckoutOrder,
} from "./checkout-order-response.cjs";

const quote = {
  quoteId: `shq_${"A".repeat(43)}`,
  carrier: "jamora-mock",
  service: "standard",
  amountMinor: 2_490,
  currency: "RON",
  estimate: { minimumDays: 2, maximumDays: 4 },
  quotedAt: "2026-07-25T08:00:00.000Z",
  expiresAt: "2026-07-25T08:10:00.000Z",
  addressDigest: "private",
};
const address = {
  recipient: "Ana",
  countryCode: "RO",
  subdivisionCode: "B",
  locality: "Bucuresti",
  postalCode: "010101",
  street: "Calea Victoriei",
  building: "10",
};

test("safe checkout order returns authoritative RON totals and shipping fields only", () => {
  const projected = safeCheckoutOrder({
    documentId: "order-1",
    id: 17,
    orderNumber: "JMR-2026-1",
    trackingNumber: "TRACK-1",
    status: "paid",
    carrier: "jamora-mock",
    customerName: "Ana",
    email: "ana@example.com",
    currency: "eur",
    items: [{
      productId: "product-1",
      slug: "jamu-energy",
      sku: "JAMU-1",
      name: "Jamu Energy",
      qty: 1,
      unitPriceCents: 3_200,
      lineTotalCents: 3_200,
      providerCost: 1,
    }],
    shippingAddress: address,
    shippingAddressText: "Calea Victoriei 10",
    shippingSnapshot: {
      shippingAddress: address,
      shippingAddressText: "Calea Victoriei 10",
      estimatedDelivery: quote.estimate,
      quote: {
        ...quote,
        estimate: {
          ...quote.estimate,
          providerSecret: "remove",
        },
      },
      providerPayload: { secret: true },
    },
    priceSnapshot: {
      reference: {
        amountMinor: 3_700,
        currency: "EUR",
        providerSecret: "remove",
      },
      charge: {
        amountMinor: 18_650,
        currency: "RON",
        providerSecret: "remove",
      },
      rate: "4.975",
      source: "demo-config",
      capturedAt: "2026-07-25T08:00:00.000Z",
      items: [{
        productDocumentId: "product-1",
        slug: "jamu-energy",
        sku: "JAMU-1",
        name: "Jamu Energy",
        qty: 1,
        unitPriceMinor: 16_160,
        lineTotalMinor: 16_160,
        currency: "RON",
        providerSecret: "remove",
      }],
      shipping: {
        ...quote,
        estimate: {
          ...quote.estimate,
          providerSecret: "remove",
        },
      },
      breakdown: {
        subtotalMinor: 16_160,
        shippingMinor: 2_490,
        discountMinor: 0,
        totalMinor: 18_650,
        currency: "RON",
        providerSecret: "remove",
      },
      providerSecret: "remove",
    },
    reservationToken: "remove",
    batchAllocations: [{ secret: true }],
    createdAt: "2026-07-25T08:01:00.000Z",
  });

  assert.deepEqual(projected, {
    id: "order-1",
    documentId: "order-1",
    orderNumber: "JMR-2026-1",
    trackingNumber: "TRACK-1",
    status: "paid",
    carrier: "jamora-mock",
    service: "standard",
    currency: "RON",
    customer: {
      name: "Ana",
      email: "ana@example.com",
      address: "Calea Victoriei 10",
    },
    shippingAddress: address,
    items: [{
      productId: "product-1",
      slug: "jamu-energy",
      sku: "JAMU-1",
      name: "Jamu Energy",
      qty: 1,
      unitPriceCents: 16_160,
      lineTotalCents: 16_160,
    }],
    subtotalCents: 16_160,
    shippingCents: 2_490,
    discountCents: 0,
    totalCents: 18_650,
    createdAt: "2026-07-25T08:01:00.000Z",
    shippingEstimate: { minimumDays: 2, maximumDays: 4 },
    priceSnapshot: {
      reference: { amountMinor: 3_700, currency: "EUR" },
      charge: { amountMinor: 18_650, currency: "RON" },
      rate: "4.975",
      source: "demo-config",
      capturedAt: "2026-07-25T08:00:00.000Z",
      shipping: {
        quoteId: quote.quoteId,
        carrier: "jamora-mock",
        service: "standard",
        amountMinor: 2_490,
        currency: "RON",
        estimate: quote.estimate,
        quotedAt: quote.quotedAt,
        expiresAt: quote.expiresAt,
      },
      items: [{
        productDocumentId: "product-1",
        slug: "jamu-energy",
        sku: "JAMU-1",
        name: "Jamu Energy",
        qty: 1,
        unitPriceMinor: 16_160,
        lineTotalMinor: 16_160,
        currency: "RON",
      }],
      breakdown: {
        subtotalMinor: 16_160,
        shippingMinor: 2_490,
        discountMinor: 0,
        totalMinor: 18_650,
        currency: "RON",
      },
    },
  });
  assert.equal(JSON.stringify(projected).includes("secret"), false);
  assert.equal(JSON.stringify(projected).includes("reservationToken"), false);
});

test("shipping order projection fails closed without one coherent RON breakdown", () => {
  assert.throws(
    () => safeCheckoutOrder({
      documentId: "order-1",
      orderNumber: "JMR-2026-1",
      status: "paid",
      email: "ana@example.com",
      shippingSnapshot: { quote },
      priceSnapshot: {
        breakdown: {
          subtotalMinor: 0,
          shippingMinor: 0,
          discountMinor: 0,
          totalMinor: 0,
          currency: "EUR",
        },
      },
    }),
    /authoritative/i,
  );
  assert.throws(
    () => safeCheckoutOrder({
      documentId: "order-1",
      orderNumber: "JMR-2026-1",
      status: "paid",
      email: "ana@example.com",
      shippingSnapshot: { quote },
      priceSnapshot: {
        charge: { amountMinor: 18_650, currency: "RON" },
        breakdown: {
          subtotalMinor: 16_160,
          shippingMinor: 2_491,
          discountMinor: 0,
          totalMinor: 18_651,
          currency: "RON",
        },
      },
    }),
    /inconsistent/i,
  );
});
