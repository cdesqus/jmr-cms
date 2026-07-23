import assert from "node:assert/strict";
import test from "node:test";

import {
  createDemoPriceSnapshot,
  getOrCreateAnonymousSessionId,
  guestShippingCents,
  normalizeCheckoutPayload,
  prepareCheckoutPayloadText,
} from "./checkout.cjs";

const structuredAddress = {
  recipient: "  Ana Popescu ",
  phone: " +40 721 000 000 ",
  countryCode: "ro",
  subdivisionCode: "B",
  locality: " București ",
  postalCode: "010101",
  street: " Calea Victoriei ",
  building: " 10 ",
  unit: " 4 ",
  instructions: " Interfon 7 ",
};

test("creates an integer-safe deterministic demo price snapshot", () => {
  assert.deepEqual(
    createDemoPriceSnapshot(199, {
      rate: "4.975000",
      capturedAt: "2026-07-24T00:00:00.000Z",
    }),
    {
      reference: { amountMinor: 199, currency: "EUR" },
      charge: { amountMinor: 990, currency: "RON" },
      rate: "4.975000",
      source: "demo-config",
      capturedAt: "2026-07-24T00:00:00.000Z",
    },
  );
});

test("normalizes structured checkout and replaces untrusted price data", () => {
  const result = normalizeCheckoutPayload(
    {
      anonymousSessionId: " session-123 ",
      customer: { name: "Ana", email: "ana@example.com", address: "untrusted" },
      shippingAddress: structuredAddress,
      subtotalCents: 1000,
      shippingCents: 495,
      discountCents: 100,
      priceSnapshot: { source: "browser" },
    },
    { rate: "4.975000", capturedAt: "2026-07-24T00:00:00.000Z" },
  );

  assert.equal(result.anonymousSessionId, "session-123");
  assert.equal(result.shippingAddress.recipient, "Ana Popescu");
  assert.equal(
    result.customer.address,
    "Ana Popescu\nCalea Victoriei 10, ap. 4\n010101 București, B\nRomania\nTelefon: +40 721 000 000\nInstrucțiuni: Interfon 7",
  );
  assert.equal(result.priceSnapshot.source, "demo-config");
  assert.equal(result.priceSnapshot.reference.amountMinor, 1395);
});

test("preserves legacy text checkout without requiring structured fields", () => {
  const result = normalizeCheckoutPayload(
    {
      customer: {
        name: "Legacy Guest",
        email: "guest@example.com",
        address: "Strada Veche 1, București",
      },
      subtotalCents: 1000,
      shippingCents: 495,
    },
    { rate: "4.975000", capturedAt: "2026-07-24T00:00:00.000Z" },
  );

  assert.equal(result.customer.address, "Strada Veche 1, București");
  assert.equal(result.shippingAddress, undefined);
  assert.equal(result.anonymousSessionId, undefined);
});

test("preserves legacy shippingAddress.address without treating it as structured", () => {
  const result = normalizeCheckoutPayload(
    {
      customer: { name: "Legacy Guest", email: "guest@example.com" },
      shippingAddress: { address: "Strada Veche 1, București" },
      subtotalCents: 1000,
      shippingCents: 495,
    },
    { rate: "4.975000", capturedAt: "2026-07-24T00:00:00.000Z" },
  );

  assert.equal(result.customer.address, "Strada Veche 1, București");
  assert.deepEqual(result.shippingAddress, { address: "Strada Veche 1, București" });
});

test("returns the raw request unchanged when structured checkout is disabled", () => {
  const raw = '{ "customer": { "address": " legacy " }, "subtotalCents": 1.5 }';
  assert.equal(prepareCheckoutPayloadText(raw, false), raw);
});

test("persists and reuses the opaque anonymous checkout UUID", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(getOrCreateAnonymousSessionId(storage, () => "uuid-1"), "uuid-1");
  assert.equal(getOrCreateAnonymousSessionId(storage, () => "uuid-2"), "uuid-1");
});

test("keeps the existing EUR 50 guest free-shipping threshold", () => {
  assert.equal(guestShippingCents(4999), 495);
  assert.equal(guestShippingCents(5000), 0);
});

test("rejects incomplete structured addresses", () => {
  assert.throws(
    () =>
      normalizeCheckoutPayload(
        {
          customer: { name: "Ana", email: "ana@example.com" },
          shippingAddress: { ...structuredAddress, postalCode: "101" },
          subtotalCents: 1000,
          shippingCents: 495,
        },
        { rate: "4.975000", capturedAt: "2026-07-24T00:00:00.000Z" },
      ),
    /postalCode/,
  );
});
