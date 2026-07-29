import assert from "node:assert/strict";
import test from "node:test";

import {
  accountsAvailable,
  customerAuthGate,
} from "./customer-auth-policy.cjs";

test("accounts are unavailable when the feature flag is false", () => {
  assert.equal(accountsAvailable({ CUSTOMER_ACCOUNTS_ENABLED: "false" }), false);
});

test("production accounts require verification delivery", () => {
  assert.equal(accountsAvailable({
    NODE_ENV: "production",
    CUSTOMER_ACCOUNTS_ENABLED: "true",
    CUSTOMER_VERIFICATION_DELIVERY_ENABLED: "false",
  }), false);
  assert.equal(accountsAvailable({
    NODE_ENV: "production",
    CUSTOMER_ACCOUNTS_ENABLED: "true",
    CUSTOMER_VERIFICATION_DELIVERY_ENABLED: "true",
  }), true);
});

test("enabled development accounts do not require a delivery provider", () => {
  assert.equal(accountsAvailable({
    NODE_ENV: "development",
    CUSTOMER_ACCOUNTS_ENABLED: "true",
  }), true);
});

test("controller gate returns a generic 404 before invoking the handler", async () => {
  let invoked = false;
  const ctx = {};
  const allowed = customerAuthGate(ctx, { CUSTOMER_ACCOUNTS_ENABLED: "false" });
  if (allowed) invoked = true;
  assert.equal(invoked, false);
  assert.equal(ctx.status, 404);
  assert.deepEqual(ctx.body, { error: "Not found." });
});
