import test from "node:test";
import assert from "node:assert/strict";
import { purchasePaymentReference } from "./membership-purchase-key.cjs";

test("creates a bounded opaque deterministic payment reference for retries", () => {
  const first = purchasePaymentReference("customer-1", "purchase", "purchase:abc");
  const retry = purchasePaymentReference("customer-1", "purchase", "purchase:abc");
  assert.equal(first, retry);
  assert.match(first, /^phase1-mock:[a-f0-9]{64}$/);
  assert.notEqual(first, purchasePaymentReference("customer-2", "purchase", "purchase:abc"));
  assert.throws(() => purchasePaymentReference("customer-1", "purchase", ""), /idempotency/i);
});

test("binds idempotency identity to operation and renewal target", () => {
  const key = "shared-key";
  assert.notEqual(
    purchasePaymentReference("customer-1", "purchase", key),
    purchasePaymentReference("customer-1", "renew", key, "membership-1"),
  );
  assert.notEqual(
    purchasePaymentReference("customer-1", "renew", key, "membership-1"),
    purchasePaymentReference("customer-1", "renew", key, "membership-2"),
  );
});
