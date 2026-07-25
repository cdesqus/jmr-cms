import assert from "node:assert/strict";
import test from "node:test";

import {
  createGuestCapabilityProof,
  customerShippingPath,
  guestCapabilityRateAllowed,
  hasGuestCapabilityProof,
  safeAddressAssessment,
  safeAddressSuggestions,
  safeShippingQuotes,
  safeShippingSelection,
  shippingOperationEnabled,
  shippingOperationBody,
  trustedShippingHeaders,
} from "./shipping-customer-policy.cjs";

const quote = {
  quoteId: `shq_${"A".repeat(43)}`,
  carrier: "Mock Courier",
  service: "standard",
  amountMinor: 2_490,
  currency: "RON",
  estimate: { minimumDays: 2, maximumDays: 4 },
  quotedAt: "2026-07-25T10:00:00.000Z",
  expiresAt: "2026-07-25T10:15:00.000Z",
};
const reservationCapability = "rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4";

test("guest reservation proof is server-signed and rate-limited before forwarding", () => {
  const proof = createGuestCapabilityProof("server-secret", reservationCapability);
  assert.equal(
    hasGuestCapabilityProof("server-secret", reservationCapability, proof),
    true,
  );
  assert.equal(
    hasGuestCapabilityProof(
      "server-secret",
      "rsv_75b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
      proof,
    ),
    false,
  );
  assert.equal(
    hasGuestCapabilityProof("wrong-secret", reservationCapability, proof),
    false,
  );
  const now = new Date("2026-07-25T10:00:00.000Z").getTime();
  for (let index = 0; index < 30; index += 1) {
    assert.equal(guestCapabilityRateAllowed(reservationCapability, now), true);
  }
  assert.equal(guestCapabilityRateAllowed(reservationCapability, now), false);
  assert.equal(
    guestCapabilityRateAllowed(
      "rsv_85b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
      now,
    ),
    true,
  );
});

test("shipping and address BFF features require their exact true flag", () => {
  assert.equal(shippingOperationEnabled("address/suggest", {
    ADDRESS_ASSIST_ENABLED: "true",
  }), true);
  assert.equal(shippingOperationEnabled("address/suggest", {
    ADDRESS_ASSIST_ENABLED: "TRUE",
  }), false);
  assert.equal(shippingOperationEnabled("shipping/quotes", {
    SHIPPING_ENABLED: "true",
  }), true);
  assert.equal(shippingOperationEnabled("shipping/quotes", {
    SHIPPING_ENABLED: "1",
  }), false);
});

test("shipping BFF has an exact POST-only operation allowlist", () => {
  assert.equal(customerShippingPath("POST", ["address", "suggest"]), "/api/jamora/address/suggest");
  assert.equal(customerShippingPath("POST", ["address", "assess"]), "/api/jamora/address/assess");
  assert.equal(customerShippingPath("POST", ["shipping", "quotes"]), "/api/jamora/shipping/quotes");
  assert.equal(customerShippingPath("POST", ["shipping", "select"]), "/api/jamora/shipping/select");
  for (const rejected of [
    ["GET", ["shipping", "quotes"]],
    ["POST", ["shipping", "labels"]],
    ["POST", ["address", "provider"]],
    ["POST", ["shipping", "select", "extra"]],
  ]) {
    assert.throws(() => customerShippingPath(...rejected), /not found/i);
  }
});

test("trusted shipping headers overwrite browser identity, capability, and provider headers", () => {
  const input = {
    authorization: "Bearer provider-token",
    cookie: "session=browser",
    "x-provider-api-key": "provider-secret",
    "x-jamora-storefront-secret": "browser-secret",
    "x-jamora-customer-document-id": "attacker",
    "x-jamora-customer-session-version": "999",
    "x-jamora-checkout-capability": "attacker-capability",
    "x-forwarded-for": "spoofed",
  };
  const customer = trustedShippingHeaders(
    input,
    "server-secret",
    { documentId: "customer-1", sessionVersion: 4 },
    "ignored-capability",
  );
  assert.deepEqual(Object.fromEntries(customer), {
    "content-type": "application/json",
    "x-jamora-customer-document-id": "customer-1",
    "x-jamora-customer-session-version": "4",
    "x-jamora-storefront-secret": "server-secret",
  });

  const guest = trustedShippingHeaders(input, "server-secret", null, reservationCapability);
  assert.deepEqual(Object.fromEntries(guest), {
    "content-type": "application/json",
    "x-jamora-checkout-capability": reservationCapability,
    "x-jamora-storefront-secret": "server-secret",
  });
  assert.throws(
    () => trustedShippingHeaders(input, "server-secret", null, ""),
    /capability/i,
  );
  for (const invalid of [
    "attacker-capability",
    "checkout-reference",
    "rsv_not-a-uuid",
  ]) {
    assert.throws(
      () => trustedShippingHeaders(input, "server-secret", null, invalid),
      /capability/i,
    );
  }
});

test("operation bodies strip browser identity and preserve the quote for server verification", () => {
  assert.deepEqual(shippingOperationBody("address/suggest", {
    query: " Calea Victoriei 10 ",
    customerDocumentId: "attacker",
    provider: { token: "secret" },
  }), { query: "Calea Victoriei 10" });
  assert.deepEqual(shippingOperationBody("shipping/quotes", {
    subjectType: "order",
    address: { countryCode: "RO", postalCode: "010101" },
    items: [{ slug: "jamu-energy", qty: 2, unitPriceCents: 1 }],
    amountMinor: 1,
    currency: "EUR",
    carrier: "forged",
  }), {
    subjectType: "order",
    address: {
      recipient: "", phone: "", countryCode: "RO", subdivisionCode: "",
      locality: "", postalCode: "010101", street: "", building: "",
      unit: "", instructions: "",
    },
    items: [{ slug: "jamu-energy", qty: 2 }],
  });
  assert.deepEqual(shippingOperationBody("shipping/select", {
    subjectType: "order",
    subjectId: "order-1",
    selection: { ...quote, amountMinor: 1, providerToken: "secret" },
    address: { countryCode: "RO", postalCode: "010101" },
  }), {
    subjectType: "order",
    subjectId: "order-1",
    selection: { ...quote, amountMinor: 1 },
    address: {
      recipient: "", phone: "", countryCode: "RO", subdivisionCode: "",
      locality: "", postalCode: "010101", street: "", building: "",
      unit: "", instructions: "",
    },
  });
});

test("safe address DTOs keep warnings visible and strip provider metadata", () => {
  assert.deepEqual(safeAddressSuggestions({
    suggestions: [{
      countryCode: "RO", subdivisionCode: "B", locality: "Bucuresti",
      postalCode: "010101", street: "Calea Victoriei", building: "10",
      confidence: 0.99, providerId: "secret",
    }],
  }), {
    suggestions: [{
      countryCode: "RO", subdivisionCode: "B", locality: "Bucuresti",
      postalCode: "010101", street: "Calea Victoriei", building: "10",
    }],
  });
  assert.deepEqual(safeAddressAssessment({
    address: {
      recipient: "Ana", phone: "", countryCode: "RO", subdivisionCode: "B",
      locality: "Cluj", postalCode: "010101", street: "Calea Victoriei",
      building: "10", unit: "", instructions: "", providerValidated: true,
    },
    errors: [],
    warnings: ["postalSubdivisionMismatch"],
    confidence: 1,
  }), {
    address: {
      recipient: "Ana", phone: "", countryCode: "RO", subdivisionCode: "B",
      locality: "Cluj", postalCode: "010101", street: "Calea Victoriei",
      building: "10", unit: "", instructions: "",
    },
    errors: [],
    warnings: ["postalSubdivisionMismatch"],
  });
});

test("safe quote DTOs validate server money and expose no provider fields", () => {
  assert.deepEqual(safeShippingQuotes({
    quotes: [{ ...quote, providerToken: "secret", internalZone: "B" }],
  }), { quotes: [quote] });
  assert.deepEqual(safeShippingSelection({
    idempotent: false,
    shipping: { ...quote, providerToken: "secret" },
  }), {
    idempotent: false,
    shipping: quote,
  });
  assert.throws(
    () => safeShippingQuotes({ quotes: [{ ...quote, amountMinor: 1.5 }] }),
    /quote response/i,
  );
});
