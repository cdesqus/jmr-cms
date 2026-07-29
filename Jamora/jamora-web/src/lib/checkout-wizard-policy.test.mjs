import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_STEPS,
  checkoutFeatureMode,
  checkoutIdentity,
  checkoutCompletionMode,
  checkoutInputDigest,
  checkoutPaymentCurrency,
  checkoutWizardReducer,
  addressWarningMessage,
  authoritativeShippingCheckoutFields,
  canRetainCheckoutQuote,
  createSingleFlight,
  initialCheckoutWizardState,
  membershipShippingReservationFields,
  serverShippingSelection,
  shouldAssessCheckoutAddress,
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

test("payments-off checkout always uses legacy synchronous completion", () => {
  for (const mode of ["guest", "customer", "member"]) {
    for (const shippingEnabled of [false, true]) {
      assert.equal(checkoutCompletionMode({
        mode,
        paymentsEnabled: false,
        shippingEnabled,
      }), "legacy_sync");
      assert.equal(checkoutCompletionMode({
        mode,
        paymentsEnabled: true,
        shippingEnabled,
      }), "payment_pending");
    }
  }
});

test("shipping always assesses the address even when suggestions are off", () => {
  assert.equal(shouldAssessCheckoutAddress({
    addressAssistEnabled: false,
    shippingEnabled: true,
  }), true);
  assert.equal(shouldAssessCheckoutAddress({
    addressAssistEnabled: true,
    shippingEnabled: false,
  }), true);
  assert.equal(shouldAssessCheckoutAddress({
    addressAssistEnabled: false,
    shippingEnabled: false,
  }), false);
});

test("unchanged input retains a live quote until quote or capability expiry", () => {
  const address = {
    recipient: "Ana",
    countryCode: "RO",
    subdivisionCode: "B",
    locality: "Bucuresti",
    postalCode: "010101",
    street: "Calea Victoriei",
    building: "10",
    unit: "4",
  };
  const digest = checkoutInputDigest(address, [
    { slug: "jamu-energy", qty: 2 },
    { slug: "jamu-calm", qty: 1 },
  ]);
  assert.equal(
    digest,
    checkoutInputDigest({ ...address }, [
      { slug: "jamu-calm", qty: 1 },
      { slug: "jamu-energy", qty: 2 },
    ]),
  );
  const selectedQuote = {
    quoteId: "shq_safe",
    expiresAt: "2026-07-25T10:15:00.000Z",
  };
  const base = {
    selectedQuote,
    selectedDigest: digest,
    nextDigest: digest,
    capabilityExpiresAt: "2026-07-25T10:10:00.000Z",
    now: new Date("2026-07-25T10:05:00.000Z"),
  };
  assert.equal(canRetainCheckoutQuote(base), true);
  assert.equal(canRetainCheckoutQuote({
    ...base,
    nextDigest: checkoutInputDigest({ ...address, building: "11" }, [
      { slug: "jamu-energy", qty: 2 },
      { slug: "jamu-calm", qty: 1 },
    ]),
  }), false);
  assert.equal(canRetainCheckoutQuote({
    ...base,
    now: new Date("2026-07-25T10:10:00.000Z"),
  }), false);
  assert.equal(canRetainCheckoutQuote({
    ...base,
    capabilityExpiresAt: undefined,
    now: new Date("2026-07-25T10:15:00.000Z"),
  }), false);
});

test("single-flight returns one promise and runs the operation once", async () => {
  const flight = createSingleFlight();
  let calls = 0;
  let release;
  const operation = () => {
    calls += 1;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = flight.run(operation);
  const second = flight.run(operation);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(flight.busy(), true);
  release("done");
  assert.equal(await first, "done");
  assert.equal(flight.busy(), false);
});

test("exact backend warning codes map to customer-friendly copy", () => {
  assert.equal(
    addressWarningMessage("postalCode is not recognized"),
    "The postal code could not be verified.",
  );
  assert.equal(
    addressWarningMessage("subdivisionCode is not recognized"),
    "The county could not be verified.",
  );
  assert.equal(
    addressWarningMessage("postalCode does not match subdivisionCode"),
    "The postal code and county do not appear to match.",
  );
  assert.equal(
    addressWarningMessage("locality could not be verified for discounted shipping zone"),
    "The locality could not be verified for this postal zone.",
  );
  assert.equal(
    addressWarningMessage("locality does not match subdivisionCode"),
    "The locality and county do not appear to match.",
  );
  assert.equal(
    addressWarningMessage("locality does not match postalCode"),
    "The locality and postal code do not appear to match.",
  );
  assert.equal(
    addressWarningMessage("Address verification is unavailable."),
    "Address verification is unavailable.",
  );
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
