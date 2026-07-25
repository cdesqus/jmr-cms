import assert from "node:assert/strict";
import test from "node:test";
import { projectAdminPayments } from "./payment-admin-projection.cjs";

test("projects bounded owner reconciliation data without payment secrets or snapshots", () => {
  const result = projectAdminPayments([
    {
      documentId: "payment-1",
      paymentReference: "JMR-TRANSFER-1",
      purpose: "order",
      amountMinor: 10_000,
      currency: "RON",
      receivedAmountMinor: 9_000,
      receivedCurrency: "RON",
      receivedAt: "2026-07-25T12:00:00.000Z",
      status: "underpaid",
      expiresAt: "2026-07-26T00:00:00.000Z",
      customerDocumentId: "customer-1",
      orderDocumentId: "order-1",
      membershipDocumentId: "membership-1",
      method: "bank_transfer",
      providerReference: "bank-internal-reference",
      idempotencyKey: "secret",
      settlementKey: "secret",
      priceSnapshot: { internal: "never expose" },
    },
  ], [
    {
      eventId: "event-1",
      paymentDocumentId: "payment-1",
      transition: "awaiting_payment->underpaid",
      actor: "owner@example.test",
      reason: "Receipt recorded",
      occurredAt: "2026-07-25T12:00:00.000Z",
      providerEventId: "private-provider-event",
      payload: { secret: "never expose" },
    },
  ]);

  assert.deepEqual(result, [{
    documentId: "payment-1",
    paymentReference: "JMR-TRANSFER-1",
    purpose: "order",
    method: "bank_transfer",
    expected: { amountMinor: 10_000, currency: "RON" },
    received: {
      amountMinor: 9_000,
      currency: "RON",
      receivedAt: "2026-07-25T12:00:00.000Z",
    },
    status: "underpaid",
    expiresAt: "2026-07-26T00:00:00.000Z",
    customerDocumentId: "customer-1",
    orderDocumentId: "order-1",
    membershipDocumentId: "membership-1",
    events: [{
      eventId: "event-1",
      transition: "awaiting_payment->underpaid",
      actor: "owner@example.test",
      reason: "Receipt recorded",
      occurredAt: "2026-07-25T12:00:00.000Z",
    }],
  }]);
});

test("omits incomplete received money and ignores events outside the bounded payment result", () => {
  assert.deepEqual(projectAdminPayments([{
    documentId: "payment-1",
    paymentReference: "JMR-1",
    purpose: "order",
    amountMinor: 1,
    currency: "EUR",
    status: "awaiting_payment",
    method: "bank_transfer",
  }], [{
    eventId: "event-foreign", paymentDocumentId: "payment-2", transition: "paid",
    actor: "owner@example.test", occurredAt: "2026-07-25T12:00:00.000Z",
  }]), [{
    documentId: "payment-1",
    paymentReference: "JMR-1",
    purpose: "order",
    method: "bank_transfer",
    expected: { amountMinor: 1, currency: "EUR" },
    status: "awaiting_payment",
    events: [],
  }]);
});
