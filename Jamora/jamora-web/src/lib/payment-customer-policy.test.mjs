import test from "node:test";
import assert from "node:assert/strict";
import {
  availablePaymentMethods,
  customerPaymentPath,
  isPaymentsEnabled,
  isRoPayEnabled,
  paymentPreparationBody,
  phase1PaidCheckoutAllowed,
  safePaymentResponse,
  safePendingOrderResponse,
  trustedPaymentHeaders,
} from "./payment-customer-policy.cjs";

const customer = { documentId: "customer-1", sessionVersion: 7 };

test("storefront payments use exact feature gates and keep manual transfer as the fallback", () => {
  for (const value of [undefined, "", "TRUE", "1", "false"]) {
    assert.equal(isPaymentsEnabled({ PAYMENTS_ENABLED: value }), false);
    assert.deepEqual(availablePaymentMethods({ PAYMENTS_ENABLED: value }), []);
  }
  assert.deepEqual(
    availablePaymentMethods({ PAYMENTS_ENABLED: "true", ROPAY_ENABLED: "false" }),
    ["bank_transfer"],
  );
  assert.deepEqual(
    availablePaymentMethods({ PAYMENTS_ENABLED: "true", ROPAY_ENABLED: "true" }),
    ["bank_transfer", "ropay"],
  );
  assert.equal(
    isRoPayEnabled({ PAYMENTS_ENABLED: "true", ROPAY_ENABLED: "TRUE" }),
    false,
  );
});

test("storefront payment BFF has a strict method and path allowlist", () => {
  assert.equal(customerPaymentPath("GET", ["methods"], false), "local:methods");
  assert.equal(
    customerPaymentPath("POST", ["bank-transfer"], false),
    "/api/jamora/payments/bank-transfer",
  );
  assert.equal(
    customerPaymentPath("POST", ["ropay", "intent"], true),
    "/api/jamora/payments/ropay/intent",
  );
  assert.equal(
    customerPaymentPath("GET", ["status", "JMR-ABC-123"], false),
    "/api/jamora/payments/status/JMR-ABC-123",
  );
  for (const input of [
    ["GET", ["bank-transfer"], true],
    ["POST", ["ropay", "intent"], false],
    ["POST", ["ropay", "callback"], true],
    ["POST", ["internal", "ropay", "status"], true],
    ["GET", ["status", "../admin"], true],
    ["DELETE", ["status", "JMR-ABC"], true],
  ]) {
    assert.throws(() => customerPaymentPath(...input), /not found/i);
  }
});

test("trusted headers bind either signed customer identity or the guest checkout capability", () => {
  const signed = trustedPaymentHeaders(
    {
      "x-jamora-customer-document-id": "attacker",
      "x-jamora-customer-session-version": "999",
      "x-jamora-checkout-capability": "attacker-capability",
      "x-jamora-storefront-secret": "attacker-secret",
    },
    "server-secret",
    customer,
  );
  assert.equal(signed.get("x-jamora-storefront-secret"), "server-secret");
  assert.equal(signed.get("x-jamora-customer-document-id"), "customer-1");
  assert.equal(signed.get("x-jamora-customer-session-version"), "7");
  assert.equal(signed.has("x-jamora-checkout-capability"), false);

  const guest = trustedPaymentHeaders({}, "server-secret", null, "reservation-token");
  assert.equal(guest.get("x-jamora-checkout-capability"), "reservation-token");
  assert.equal(guest.has("x-jamora-customer-document-id"), false);
  assert.equal(guest.has("x-jamora-customer-session-version"), false);
  assert.throws(
    () => trustedPaymentHeaders({}, "server-secret", null, ""),
    /capability/i,
  );
});

test("payment preparation accepts only exact purpose-bound subject fields", () => {
  assert.deepEqual(paymentPreparationBody({
    idempotencyKey: "prepare:order-1",
    subjectType: "order",
    subjectId: "order-1",
    purpose: "order",
    currency: "RON",
    checkoutReference: " checkout-1 ",
    amountMinor: 1,
    ownerDocumentId: "attacker",
    priceSnapshot: { forged: true },
    providerReference: "secret",
  }), {
    idempotencyKey: "prepare:order-1",
    subjectType: "order",
    subjectId: "order-1",
    purpose: "order",
    currency: "RON",
    checkoutReference: "checkout-1",
  });
  assert.deepEqual(paymentPreparationBody({
    idempotencyKey: "prepare:membership-1",
    subjectType: "membership",
    subjectId: "membership-1",
    purpose: "membership_renewal",
    currency: "RON",
  }), {
    idempotencyKey: "prepare:membership-1",
    subjectType: "membership",
    subjectId: "membership-1",
    purpose: "membership_renewal",
    currency: "RON",
  });
  assert.throws(() => paymentPreparationBody({
    idempotencyKey: "x",
    subjectType: "order",
    subjectId: "order-1",
    purpose: "membership_purchase",
    currency: "RON",
  }), /subject and purpose/i);
});

test("browser DTO strips provider secrets, signatures, metadata, and unrestricted URLs", () => {
  const safe = safePaymentResponse({
    method: "ropay",
    status: "pending_provider",
    paymentReference: "JMR-ROPAY-123",
    amountMinor: 12345,
    currency: "RON",
    expiresAt: "2026-07-25T10:00:00.000Z",
    qrUrl: "https://mock.ropay.invalid/qr/token",
    deepLink: "ropay://pay/token",
    providerReference: "provider-secret",
    signature: "signature-secret",
    priceSnapshot: { internal: true },
    sessionToken: "token",
  });
  assert.deepEqual(safe, {
    method: "ropay",
    status: "pending_provider",
    paymentReference: "JMR-ROPAY-123",
    amountMinor: 12345,
    currency: "RON",
    expiresAt: "2026-07-25T10:00:00.000Z",
    qrUrl: "https://mock.ropay.invalid/qr/token",
    deepLink: "ropay://pay/token",
  });
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.throws(
    () => safePaymentResponse({ ...safe, qrUrl: "javascript:alert(1)" }),
    /invalid payment response/i,
  );
  for (const unsafe of [
    { qrUrl: "https://attacker.example/qr/token" },
    { qrUrl: "https://mock.ropay.invalid/qr/token?redirect=attacker" },
    { deepLink: "ropay://evil/token" },
    { deepLink: "ropay://pay/different-token" },
  ]) {
    assert.throws(
      () => safePaymentResponse({ ...safe, ...unsafe }),
      /invalid payment response/i,
    );
  }

  assert.deepEqual(safePaymentResponse({
    method: "bank_transfer",
    status: "awaiting_payment",
    paymentReference: "JMR-BANK-123",
    amountMinor: 5000,
    currency: "EUR",
    expiresAt: "2026-07-28T10:00:00.000Z",
    beneficiary: {
      name: "Jamora SRL",
      iban: "RO49AAAA1B31007593840000",
      bank: "Jamora Bank",
      internalAccountId: "do-not-leak",
    },
  }), {
    method: "bank_transfer",
    status: "awaiting_payment",
    paymentReference: "JMR-BANK-123",
    amountMinor: 5000,
    currency: "EUR",
    expiresAt: "2026-07-28T10:00:00.000Z",
    beneficiary: {
      name: "Jamora SRL",
      iban: "RO49AAAA1B31007593840000",
      bank: "Jamora Bank",
    },
  });
});

test("pending order response exposes only the subject binding needed for payment", () => {
  assert.deepEqual(safePendingOrderResponse({
    ok: true,
    order: {
      documentId: "order-1",
      orderNumber: "JMR-2026-1",
      status: "pending",
      customerDocumentId: "customer-1",
      reservationToken: "secret-capability",
      priceSnapshot: { internal: true },
    },
  }), {
    order: {
      documentId: "order-1",
      orderNumber: "JMR-2026-1",
      status: "pending",
    },
  });
  assert.throws(
    () => safePendingOrderResponse({ order: { documentId: "order-1", status: "paid" } }),
    /invalid order response/i,
  );
});

test("Phase 2 removes ordinary customer access to the Phase 1 paid adapter", () => {
  assert.equal(
    phase1PaidCheckoutAllowed({ PAYMENTS_ENABLED: "true" }, "ordinary"),
    false,
  );
  assert.equal(
    phase1PaidCheckoutAllowed({ PAYMENTS_ENABLED: "false" }, "ordinary"),
    true,
  );
  assert.equal(
    phase1PaidCheckoutAllowed({ PAYMENTS_ENABLED: "true" }, "membership"),
    true,
  );
});
