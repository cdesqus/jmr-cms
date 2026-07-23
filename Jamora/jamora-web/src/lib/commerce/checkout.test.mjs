import assert from "node:assert/strict";
import test from "node:test";

import {
  createDemoPriceSnapshot,
  normalizeCheckoutPayload,
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
