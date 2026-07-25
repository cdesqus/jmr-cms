import assert from "node:assert/strict";
import test from "node:test";

import createShippingQuoteService from "./shipping-quote.ts";
import {
  quoteShipping,
  selectShippingQuote,
} from "./shipping-domain.cjs";

const secret = "service-shipping-secret-at-least-32-bytes";
const quotedAt = new Date("2026-07-25T10:00:00.000Z");
const address = {
  recipient: "Ana Popescu",
  countryCode: "RO",
  subdivisionCode: "CJ",
  locality: "Cluj-Napoca",
  postalCode: "400001",
  street: "Strada Memorandumului",
  building: "10",
};
const product = {
  documentId: "product-1",
  slug: "energy",
  netWeight: "90 g",
};
const items = [{ slug: "energy", qty: 1 }];

function fixture() {
  const locks = [];
  const strapi = {
    db: {
      query(uid) {
        assert.equal(uid, "api::product.product");
        return {
          findMany: async () => [product],
        };
      },
      connection(table) {
        assert.equal(table, "products");
        const chain = {
          where(value) {
            locks.push(["where", value]);
            return chain;
          },
          transacting(value) {
            locks.push(["transacting", value]);
            return chain;
          },
          forUpdate() {
            locks.push(["forUpdate"]);
            return chain;
          },
          first: async () => {
            locks.push(["first"]);
          },
        };
        return chain;
      },
    },
  };
  return { locks, service: createShippingQuoteService({ strapi }) };
}

function selectedSnapshot() {
  const selection = quoteShipping({
    address,
    items,
    products: [product],
  }, { secret, now: quotedAt })[0];
  return selectShippingQuote({
    selection,
    address,
    items,
    products: [product],
  }, { secret, now: quotedAt }).snapshot;
}

async function withShippingEnvironment(callback) {
  const previous = {
    SHIPPING_ENABLED: process.env.SHIPPING_ENABLED,
    SHIPPING_QUOTE_SECRET: process.env.SHIPPING_QUOTE_SECRET,
  };
  process.env.SHIPPING_ENABLED = "true";
  process.env.SHIPPING_QUOTE_SECRET = secret;
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("locked ordinary payment subject revalidates exact shipping and RON aggregate", async () => {
  await withShippingEnvironment(async () => {
    const quote = selectedSnapshot();
    const shippingAddressText = "Ana Popescu\nStrada Memorandumului 10\n400001 Cluj-Napoca, CJ\nRomania";
    const order = {
      items,
      currency: "eur",
      carrier: quote.carrier,
      subtotalCents: 3000,
      discountCents: 500,
      shippingCents: 420,
      totalCents: 2920,
      shippingAddress: address,
      shippingAddressText,
      shippingSnapshot: { shippingAddress: address, shippingAddressText, quote },
      priceSnapshot: {
        reference: { amountMinor: 2920, currency: "EUR" },
        charge: { amountMinor: 14528, currency: "RON" },
        rate: "4.975000",
        shipping: quote,
      },
    };

    const subjectService = fixture();
    assert.equal(
      await subjectService.service.validateLockedSubject({
        order,
        now: new Date("2026-07-25T10:14:59.999Z"),
        trx: { id: "payment-transaction" },
      }),
      quote,
    );
    assert.deepEqual(subjectService.locks, [
      ["where", { document_id: "product-1" }],
      ["transacting", { id: "payment-transaction" }],
      ["forUpdate"],
      ["first"],
    ]);
    await assert.rejects(
      fixture().service.validateLockedSubject({
        order: { ...order, totalCents: order.totalCents + 1 },
        now: new Date("2026-07-25T10:05:00.000Z"),
      }),
      /shipping order aggregate binding changed/i,
    );
    await assert.rejects(
      fixture().service.validateLockedSubject({
        order: {
          ...order,
          carrier: "forged-carrier",
          priceSnapshot: {
            ...order.priceSnapshot,
            shipping: { ...quote, service: "express" },
          },
        },
        now: new Date("2026-07-25T10:05:00.000Z"),
      }),
      /shipping order aggregate binding changed/i,
    );
    await assert.rejects(
      fixture().service.validateLockedSubject({
        order: {
          ...order,
          shippingAddress: { ...address, building: "11" },
        },
        now: new Date("2026-07-25T10:05:00.000Z"),
      }),
      /shipping order aggregate binding changed/i,
    );
    await assert.rejects(
      fixture().service.validateLockedSubject({
        order,
        now: new Date("2026-07-25T10:15:00.000Z"),
      }),
      /shipping quote expired/i,
    );
  });
});

test("locked membership payment subject requires RON quote totals and matching order snapshot", async () => {
  await withShippingEnvironment(async () => {
    const quote = selectedSnapshot();
    const checkout = {
      items,
      currency: "RON",
      totals: {
        merchandiseMinor: 0,
        shippingMinor: quote.amountMinor,
        totalMinor: quote.amountMinor,
      },
      shippingSnapshot: { shippingAddress: address, quote },
    };
    assert.equal(
      await fixture().service.validateLockedSubject({
        checkout,
        order: { shippingSnapshot: checkout.shippingSnapshot },
        now: new Date("2026-07-25T10:05:00.000Z"),
      }),
      quote,
    );
    await assert.rejects(
      fixture().service.validateLockedSubject({
        checkout: {
          ...checkout,
          totals: { ...checkout.totals, totalMinor: 1 },
        },
        order: {},
        now: new Date("2026-07-25T10:05:00.000Z"),
      }),
      /shipping checkout aggregate binding changed/i,
    );
  });
});
