import assert from "node:assert/strict";
import test from "node:test";
import {
  quoteShipping,
  selectShippingQuote,
  validateShippingSnapshot,
} from "./shipping-domain.cjs";

const SECRET = "test-shipping-quote-secret-at-least-32-bytes";
const NOW = new Date("2026-07-25T10:00:00.000Z");

const address = {
  recipient: "Ana Popescu",
  phone: "+40 712 345 678",
  countryCode: "RO",
  subdivisionCode: "RO-CJ",
  locality: "Cluj-Napoca",
  postalCode: "400001",
  street: "Strada Memorandumului",
  building: "10",
  unit: "2",
  instructions: "Sună la interfon",
};

const products = [
  {
    documentId: "product-energy",
    slug: "energy",
    netWeight: "30 sachets - 90 g",
  },
  {
    documentId: "product-balance",
    slug: "balance",
    netWeight: "0.75 kg",
  },
];

const items = [
  { slug: "energy", qty: 2, weightGrams: 999_999, zone: "free" },
  { slug: "balance", qty: 1, weightGrams: 1 },
];

const options = { secret: SECRET, now: NOW };

test("derives item weight and Romanian zone on the server and returns safe RON quotes", () => {
  const quotes = quoteShipping({ address, items, products }, options);

  assert.deepEqual(
    quotes.map((quote) => ({
      carrier: quote.carrier,
      service: quote.service,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      estimate: quote.estimate,
      quotedAt: quote.quotedAt,
      expiresAt: quote.expiresAt,
    })),
    [
      {
        carrier: "jamora-mock",
        service: "standard",
        amountMinor: 2090,
        currency: "RON",
        estimate: { minimumDays: 2, maximumDays: 3 },
        quotedAt: "2026-07-25T10:00:00.000Z",
        expiresAt: "2026-07-25T10:15:00.000Z",
      },
      {
        carrier: "jamora-mock",
        service: "express",
        amountMinor: 3890,
        currency: "RON",
        estimate: { minimumDays: 1, maximumDays: 2 },
        quotedAt: "2026-07-25T10:00:00.000Z",
        expiresAt: "2026-07-25T10:15:00.000Z",
      },
    ],
  );
  for (const quote of quotes) {
    assert.match(quote.quoteId, /^shq_[A-Za-z0-9_-]{43}$/);
    assert.equal("zone" in quote, false);
    assert.equal("weightGrams" in quote, false);
    assert.equal("addressDigest" in quote, false);
    assert.equal("itemsDigest" in quote, false);
    assert.ok(Number.isSafeInteger(quote.amountMinor));
  }
});

test("server-derived address zones change price and estimates without accepting a browser zone", () => {
  const bucharest = quoteShipping({
    address: {
      ...address,
      subdivisionCode: "RO-B",
      locality: "București",
      postalCode: "010001",
      zone: "remote",
    },
    items: [{ slug: "energy", qty: 1 }],
    products,
  }, options);
  const national = quoteShipping({
    address: {
      ...address,
      subdivisionCode: "RO-MM",
      locality: "Baia Mare",
      postalCode: "430001",
      zone: "metro",
    },
    items: [{ slug: "energy", qty: 1 }],
    products,
  }, options);

  assert.equal(bucharest[0].amountMinor, 1690);
  assert.deepEqual(bucharest[0].estimate, { minimumDays: 1, maximumDays: 2 });
  assert.equal(national[0].amountMinor, 2440);
  assert.deepEqual(national[0].estimate, { minimumDays: 3, maximumDays: 5 });
});

test("contradictory postal and subdivision signals can never select a cheaper zone", () => {
  const clujWithBucharestPostal = quoteShipping({
    address: {
      ...address,
      subdivisionCode: "CJ",
      postalCode: "010001",
    },
    items: [{ slug: "energy", qty: 1 }],
    products,
  }, options);
  const bucharestWithClujPostal = quoteShipping({
    address: {
      ...address,
      subdivisionCode: "B",
      locality: "București",
      postalCode: "400001",
    },
    items: [{ slug: "energy", qty: 1 }],
    products,
  }, options);

  assert.equal(clujWithBucharestPostal[0].amountMinor, 2090);
  assert.equal(bucharestWithClujPostal[0].amountMinor, 2440);
});

test("selects one signed quote into an immutable snapshot and exact replay is idempotent", () => {
  const quote = quoteShipping({ address, items, products }, options)[1];
  const first = selectShippingQuote({
    selection: quote,
    address,
    items,
    products,
  }, options);
  const replay = selectShippingQuote({
    selection: { ...quote },
    address: { ...address },
    items: [...items].reverse(),
    products: [...products].reverse(),
    existingSnapshot: structuredClone(first.snapshot),
  }, options);

  assert.equal(first.idempotent, false);
  assert.equal(replay.idempotent, true);
  assert.deepEqual(replay.snapshot, first.snapshot);
  assert.equal(first.snapshot.totalWeightGrams, 930);
  assert.equal(first.snapshot.zone, "regional");
  assert.match(first.snapshot.addressDigest, /^[a-f0-9]{64}$/);
  assert.match(first.snapshot.itemsDigest, /^[a-f0-9]{64}$/);
});

test("rejects forged price, service, carrier, estimate, time, or quote id", () => {
  const quote = quoteShipping({ address, items, products }, options)[0];
  const mutations = [
    { amountMinor: quote.amountMinor - 1 },
    { service: "express" },
    { carrier: "forged-carrier" },
    { estimate: { minimumDays: 0, maximumDays: 1 } },
    { expiresAt: "2026-07-25T10:20:00.000Z" },
    { quoteId: `shq_${"A".repeat(43)}` },
  ];

  for (const mutation of mutations) {
    assert.throws(
      () => selectShippingQuote({
        selection: { ...quote, ...mutation },
        address,
        items,
        products,
      }, options),
      /shipping quote is invalid/i,
    );
  }
});

test("rejects expired quotes and snapshots at the exact fifteen-minute boundary", () => {
  const quote = quoteShipping({ address, items, products }, options)[0];
  assert.throws(
    () => selectShippingQuote({
      selection: quote,
      address,
      items,
      products,
    }, { ...options, now: new Date("2026-07-25T10:15:00.000Z") }),
    /shipping quote expired/i,
  );

  const { snapshot } = selectShippingQuote({
    selection: quote,
    address,
    items,
    products,
  }, options);
  assert.throws(
    () => validateShippingSnapshot({
      snapshot,
      address,
      items,
      products,
    }, { ...options, now: new Date("2026-07-25T10:15:00.000Z") }),
    /shipping quote expired/i,
  );
});

test("revalidation rejects changed authoritative address, items, or product weight", () => {
  const quote = quoteShipping({ address, items, products }, options)[0];
  const { snapshot } = selectShippingQuote({
    selection: quote,
    address,
    items,
    products,
  }, options);
  const changes = [
    { address: { ...address, building: "11" }, items, products },
    { address, items: [{ slug: "energy", qty: 1 }], products },
    {
      address,
      items,
      products: products.map((product) => product.slug === "energy"
        ? { ...product, netWeight: "100 g" }
        : product),
    },
  ];

  for (const changed of changes) {
    assert.throws(
      () => validateShippingSnapshot({ snapshot, ...changed }, options),
      /shipping snapshot binding changed/i,
    );
  }
});

test("fails closed for missing products and unusable server weight", () => {
  assert.throws(
    () => quoteShipping({
      address,
      items: [{ slug: "unknown", qty: 1 }],
      products,
    }, options),
    /unknown shipping product/i,
  );
  assert.throws(
    () => quoteShipping({
      address,
      items: [{ slug: "energy", qty: 1 }],
      products: [{ documentId: "product-energy", slug: "energy", netWeight: "one box" }],
    }, options),
    /authoritative product weight/i,
  );
});
