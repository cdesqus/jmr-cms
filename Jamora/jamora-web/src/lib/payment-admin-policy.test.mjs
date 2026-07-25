import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPaymentReceiptInput,
  assertPaymentResolutionInput,
  assertPaymentAdminMethod,
  canManagePayments,
  isPaymentsEnabled,
  paymentAdminPath,
  paymentProviderError,
  safePaymentMutationResponse,
} from "./payment-admin-policy.cjs";

test("payment reconciliation is enabled only by the exact true flag and only for owners", () => {
  assert.equal(isPaymentsEnabled({ PAYMENTS_ENABLED: "true" }), true);
  for (const value of [undefined, "TRUE", "1", " true"]) {
    assert.equal(isPaymentsEnabled({ PAYMENTS_ENABLED: value }), false);
  }
  assert.equal(canManagePayments({ role: "owner" }), true);
  for (const identity of [null, { role: "support" }, { role: "warehouse" }, { role: "content" }]) {
    assert.equal(canManagePayments(identity), false);
  }
});

test("allows only the documented owner payment BFF operations", () => {
  assert.equal(paymentAdminPath(["list"]), "/api/jamora/admin/payments");
  assert.equal(paymentAdminPath(["payment-1", "receipt"]), "/api/jamora/admin/payments/payment-1/receipt");
  assert.equal(paymentAdminPath(["payment-1", "resolve"]), "/api/jamora/admin/payments/payment-1/resolve");
  assert.equal(paymentAdminPath(["expire"]), "/api/jamora/admin/payments/expire");
  assert.throws(() => paymentAdminPath(["payment-1"]), /not allowed/i);
  assert.throws(() => paymentAdminPath(["..", "receipt"]), /not allowed/i);
  assert.throws(() => paymentAdminPath(["payment-1", "delete"]), /not allowed/i);
});

test("enforces the BFF method allowlist and does not relay provider errors", () => {
  assert.doesNotThrow(() => assertPaymentAdminMethod("GET", ["list"]));
  assert.doesNotThrow(() => assertPaymentAdminMethod("POST", ["payment-1", "receipt"]));
  assert.doesNotThrow(() => assertPaymentAdminMethod("POST", ["payment-1", "resolve"]));
  assert.doesNotThrow(() => assertPaymentAdminMethod("POST", ["expire"]));
  assert.throws(() => assertPaymentAdminMethod("POST", ["list"]), /not allowed/i);
  assert.throws(() => assertPaymentAdminMethod("GET", ["payment-1", "receipt"]), /not allowed/i);
  assert.equal(paymentProviderError({ error: "Provider API key missing" }), "Payment service unavailable.");
  assert.equal(paymentProviderError(null), "Payment service unavailable.");
});

test("allows only safe receipt and mismatch-resolution fields", () => {
  assert.deepEqual(assertPaymentReceiptInput({
    amountMinor: 10_000,
    currency: " eur ",
    bankReference: " BANK-REF-1 ",
    actor: "forged@example.test",
    providerEventId: "forged",
  }), { amountMinor: 10_000, currency: "EUR", bankReference: "BANK-REF-1" });
  assert.throws(() => assertPaymentReceiptInput({ amountMinor: 1.5, currency: "RON" }), /safe integer/i);
  assert.throws(() => assertPaymentReceiptInput({ amountMinor: 1, currency: "USD" }), /RON or EUR/i);

  assert.deepEqual(assertPaymentResolutionInput({
    reason: "Underpayment accepted after bank fee.",
    resolution: "cancel",
    actor: "forged@example.test",
  }), { reason: "Underpayment accepted after bank fee.", resolution: "cancel" });
  assert.throws(() => assertPaymentResolutionInput({ reason: " " }), /reason/i);
  assert.throws(() => assertPaymentResolutionInput({ reason: "Reason", resolution: "refund" }), /accept or cancel/i);
});

test("BFF mutation responses retain only reconciliation outcomes", () => {
  const internalPayment = {
    documentId: "payment-1",
    paymentReference: "JMR-1",
    status: "paid",
    idempotent: false,
    idempotencyKey: "internal-key",
    settlementKey: "settlement-key",
    providerReference: "provider-reference",
    ownerDocumentId: "owner-1",
    subjectId: "order-1",
    priceSnapshot: { secret: "never expose" },
    event: { payload: { secret: "never expose" } },
  };
  assert.deepEqual(
    safePaymentMutationResponse(internalPayment, ["payment-1", "receipt"]),
    { documentId: "payment-1", paymentReference: "JMR-1", status: "paid", idempotent: false },
  );
  assert.deepEqual(
    safePaymentMutationResponse(internalPayment, ["payment-1", "resolve"]),
    { documentId: "payment-1", paymentReference: "JMR-1", status: "paid", idempotent: false, resolution: "accept" },
  );
  assert.deepEqual(
    safePaymentMutationResponse({ expired: 2, providerReference: "never expose" }, ["expire"]),
    { expired: 2 },
  );
});
