import assert from "node:assert/strict";
import test from "node:test";

import createShippingQuoteService, {
  assertShippingSubjectOwner,
} from "./shipping-quote.ts";
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
  id: 101,
  documentId: "product-1",
  slug: "energy",
  netWeight: "90 g",
  publishedAt: "2026-07-24T10:00:00.000Z",
};
const items = [{ slug: "energy", qty: 1 }];

function fixture() {
  const locks = [];
  const queries = [];
  const strapi = {
    contentTypes: {
      "api::product.product": {
        pluginOptions: {},
      },
    },
    db: {
      query(uid) {
        assert.equal(uid, "api::product.product");
        return {
          findMany: async (query) => {
            queries.push(query);
            return [product];
          },
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
  return { locks, queries, service: createShippingQuoteService({ strapi }) };
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

test("shipping subject ownership separates membership customers from ordinary guest reservations", () => {
  assert.throws(
    () => assertShippingSubjectOwner(
      {
        customerDocumentId: "customer-1",
        checkoutReference: "membership-checkout-reference",
      },
      { guestCheckoutCapability: "membership-checkout-reference" },
      "membership_checkout",
    ),
    /shipping subject not found/i,
  );
  assert.throws(
    () => assertShippingSubjectOwner(
      {
        checkoutReference: "ordinary-checkout-reference",
        reservationToken: "reservation-capability",
      },
      { guestCheckoutCapability: "ordinary-checkout-reference" },
      "order",
    ),
    /shipping subject not found/i,
  );
  assert.doesNotThrow(() => assertShippingSubjectOwner(
    {
      checkoutReference: "ordinary-checkout-reference",
      reservationToken: "reservation-capability",
    },
    { guestCheckoutCapability: "reservation-capability" },
    "order",
  ));
});

test("shipping quotes select an explicit published product version without a limiting ambiguity", async () => {
  await withShippingEnvironment(async () => {
    const subjectService = fixture();
    await subjectService.service.quoteShipping({
      address,
      items,
      now: quotedAt,
    });

    assert.deepEqual(subjectService.queries, [{
      where: {
        slug: { $in: ["energy"] },
        publishedAt: { $notNull: true },
      },
      select: ["id", "documentId", "slug", "netWeight", "publishedAt"],
    }]);
  });
});

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
      ["where", { id: 101 }],
      ["transacting", { id: "payment-transaction" }],
      ["forUpdate"],
      ["first"],
    ]);
    assert.deepEqual(subjectService.queries[1], {
      where: {
        id: { $in: [101] },
        publishedAt: { $notNull: true },
      },
      select: ["id", "documentId", "slug", "netWeight", "publishedAt"],
      transacting: { id: "payment-transaction" },
    });
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
