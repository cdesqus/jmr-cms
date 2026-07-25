import test from "node:test";
import assert from "node:assert/strict";
import {
  pendingPaymentOrderFields,
  phase1MockPaidOrderFields,
} from "./payment-order.cjs";

test("customer payment orders remain pending with an authoritative price snapshot", () => {
  const fields = pendingPaymentOrderFields({
    customerDocumentId: "customer-1",
    priceSnapshot: {
      reference: { amountMinor: 2_000, currency: "EUR" },
      charge: { amountMinor: 10_000, currency: "RON" },
    },
  });
  assert.deepEqual(fields, {
    status: "pending",
    customerDocumentId: "customer-1",
    priceSnapshot: {
      reference: { amountMinor: 2_000, currency: "EUR" },
      charge: { amountMinor: 10_000, currency: "RON" },
    },
    statusHistory: [{
      type: "status",
      status: "pending",
      note: "Awaiting payment confirmation.",
      actor: "Checkout",
    }],
  });
});

test("the Phase 1 paid order adapter remains explicit and isolated", () => {
  assert.deepEqual(phase1MockPaidOrderFields("JMR-2026-1"), {
    status: "paid",
    stripeSessionId: "mock-paid-checkout",
    invoiceNumber: "INV-2026-1",
    statusHistory: [{
      type: "status",
      status: "paid",
      note: "Payment confirmed in test mode.",
      actor: "Checkout",
    }],
  });
});
