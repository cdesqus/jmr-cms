import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransition,
  classifyReceipt,
  normaliseMoney,
  paymentReference,
} from "./payment-domain.cjs";

test("normalises supported money in safe minor units", () => {
  assert.deepEqual(
    normaliseMoney({ amountMinor: 10000, currency: " ron " }),
    { amountMinor: 10000, currency: "RON" },
  );
  assert.throws(() => normaliseMoney({ amountMinor: 1.5, currency: "RON" }));
  assert.throws(() => normaliseMoney({ amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RON" }));
  assert.throws(() => normaliseMoney({ amountMinor: 100, currency: "USD" }));
});

test("classifies receipts against the expected amount and currency", () => {
  assert.deepEqual(
    classifyReceipt({ amountMinor: 10000, currency: "RON" }, { amountMinor: 9000, currency: "RON" }),
    { status: "underpaid", differenceMinor: -1000 },
  );
  assert.deepEqual(
    classifyReceipt({ amountMinor: 10000, currency: "RON" }, { amountMinor: 10000, currency: "EUR" }),
    { status: "currency_mismatch", differenceMinor: 0 },
  );
  assert.deepEqual(
    classifyReceipt({ amountMinor: 10000, currency: "RON" }, { amountMinor: 10000, currency: "RON" }),
    { status: "paid", differenceMinor: 0 },
  );
  assert.deepEqual(
    classifyReceipt({ amountMinor: 10000, currency: "RON" }, { amountMinor: 11000, currency: "RON" }),
    { status: "overpaid", differenceMinor: 1000 },
  );
});

test("permits only explicit payment status transitions", () => {
  assert.equal(canTransition("awaiting_payment", "pending_provider"), true);
  assert.equal(canTransition("pending_provider", "paid"), true);
  assert.equal(canTransition("paid", "refunded"), true);
  assert.equal(canTransition("paid", "awaiting_payment"), false);
  assert.equal(canTransition("refunded", "paid"), false);
  assert.equal(canTransition("unknown", "paid"), false);
});

test("formats deterministic uppercase payment references", () => {
  assert.equal(paymentReference("JMR", "8f3a2c"), "JMR-8F3A2C");
  assert.match(paymentReference("JMR", "8f3a2c"), /^JMR-[A-Z0-9-]+$/);
  assert.throws(() => paymentReference("JMR!", "8f3a2c"));
});
