import test from "node:test";
import assert from "node:assert/strict";
import { purchasePaymentReference } from "./membership-purchase-key.cjs";

test("creates a bounded opaque deterministic payment reference for retries", () => {
  const first = purchasePaymentReference("customer-1", "purchase:abc");
  const retry = purchasePaymentReference("customer-1", "purchase:abc");
  assert.equal(first, retry);
  assert.match(first, /^phase1-mock:[a-f0-9]{64}$/);
  assert.notEqual(first, purchasePaymentReference("customer-2", "purchase:abc"));
  assert.throws(() => purchasePaymentReference("customer-1", ""), /idempotency/i);
});
