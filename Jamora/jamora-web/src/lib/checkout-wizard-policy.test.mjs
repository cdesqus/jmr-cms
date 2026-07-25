import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_STEPS,
  checkoutFeatureMode,
  checkoutIdentity,
  checkoutPaymentCurrency,
  checkoutWizardReducer,
  authoritativeShippingCheckoutFields,
  initialCheckoutWizardState,
  membershipShippingReservationFields,
  serverShippingSelection,
} from "./checkout-wizard-policy.cjs";

test("checkout uses the exact five-step order for every mode", () => {
  assert.deepEqual(CHECKOUT_STEPS, [
    "contact",
    "address",
    "delivery",
    "payment",
    "review",
  ]);
  for (const mode of ["guest", "customer", "member"]) {
    assert.deepEqual(initialCheckoutWizardState(mode).steps, CHECKOUT_STEPS);
  }
});

test("back and forward navigation preserves entered checkout state", () => {
  let state = initialCheckoutWizardState("guest");
  state = checkoutWizardReducer(state, {
    type: "contact",
    value: { name: "Ana", email: "ana@example.com" },
  });
  state = checkoutWizardReducer(state, { type: "next" });
  state = checkoutWizardReducer(state, {
    type: "address",
    value: { street: "Calea Victoriei", building: "10" },
  });
  state = checkoutWizardReducer(state, {
    type: "warnings",
    value: ["postalCode does not match subdivisionCode"],
  });
  state = checkoutWizardReducer(state, { type: "next" });
  state = checkoutWizardReducer(state, {
    type: "quote",
    value: { quoteId: "shq_safe", amountMinor: 2_490 },
  });
  state = checkoutWizardReducer(state, { type: "back" });
  state = checkoutWizardReducer(state, { type: "next" });

  assert.equal(state.step, "delivery");
  assert.deepEqual(state.contact, { name: "Ana", email: "ana@example.com" });
  assert.deepEqual(state.address, {
    street: "Calea Victoriei",
    building: "10",
  });
  assert.equal(state.selectedQuote.quoteId, "shq_safe");
  assert.deepEqual(state.addressWarnings, [
    "postalCode does not match subdivisionCode",
  ]);
});

test("identity distinguishes guest capability, signed customer, and member", () => {
  assert.deepEqual(checkoutIdentity({
    customer: null,
    membershipSelected: false,
    reservationCapability: " reserve-1 ",
  }), {
    kind: "guest",
    reservationCapability: "reserve-1",
  });
  assert.deepEqual(checkoutIdentity({
    customer: { documentId: "customer-1" },
    membershipSelected: false,
    reservationCapability: "attacker-value",
  }), {
    kind: "customer",
    customerDocumentId: "customer-1",
  });
  assert.deepEqual(checkoutIdentity({
    customer: { documentId: "customer-1" },
    membershipSelected: true,
  }), {
    kind: "member",
    customerDocumentId: "customer-1",
  });
  assert.throws(
    () => checkoutIdentity({
      customer: null,
      membershipSelected: true,
      reservationCapability: "reserve-1",
    }),
    /authenticated customer/i,
  );
});

test("feature-off mode keeps all steps and uses manual structured delivery", () => {
  assert.deepEqual(checkoutFeatureMode({
    ADDRESS_ASSIST_ENABLED: "false",
    SHIPPING_ENABLED: "false",
  }), {
    addressAssist: false,
    authoritativeShipping: false,
    manualStructuredAddress: true,
    steps: CHECKOUT_STEPS,
  });
  assert.deepEqual(checkoutFeatureMode({
    ADDRESS_ASSIST_ENABLED: "true",
    SHIPPING_ENABLED: "true",
  }), {
    addressAssist: true,
    authoritativeShipping: true,
    manualStructuredAddress: false,
    steps: CHECKOUT_STEPS,
  });
});

test("feature-off ordinary payment stays RON while member fallback stays EUR", () => {
  assert.equal(checkoutPaymentCurrency("guest", false), "RON");
  assert.equal(checkoutPaymentCurrency("customer", false), "RON");
  assert.equal(checkoutPaymentCurrency("member", false), "EUR");
  assert.equal(checkoutPaymentCurrency("member", true), "RON");
});

test("browser shipping selection carries only the immutable safe server quote DTO", () => {
  const quote = serverShippingSelection({
    quoteId: "shq_safe",
    carrier: "Mock Courier",
    service: "express",
    amountMinor: 2_490,
    currency: "RON",
    estimate: { minimumDays: 1, maximumDays: 2 },
    quotedAt: "2026-07-25T10:00:00.000Z",
    expiresAt: "2026-07-25T10:15:00.000Z",
    providerToken: "never-forward",
  });
  assert.deepEqual(quote, {
    quoteId: "shq_safe",
    carrier: "Mock Courier",
    service: "express",
    amountMinor: 2_490,
    currency: "RON",
    estimate: { minimumDays: 1, maximumDays: 2 },
    quotedAt: "2026-07-25T10:00:00.000Z",
    expiresAt: "2026-07-25T10:15:00.000Z",
  });
  assert.deepEqual(authoritativeShippingCheckoutFields(quote), {
    shippingSelection: quote,
  });
  assert.deepEqual(membershipShippingReservationFields({
    membershipDocumentId: " membership-1 ",
    idempotencyKey: " attempt-1 ",
  }, quote), {
    membershipDocumentId: "membership-1",
    idempotencyKey: "attempt-1",
    shippingSelection: quote,
  });
  assert.throws(
    () => serverShippingSelection({ quoteId: "", amountMinor: 1 }),
    /quote/i,
  );
});
