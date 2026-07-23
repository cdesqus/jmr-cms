import assert from "node:assert/strict";
import test from "node:test";
import { customerAccountsAvailable } from "./customer-account-policy.cjs";

test("production storefront requires verification delivery for accounts", () => {
  assert.equal(customerAccountsAvailable({
    NODE_ENV: "production",
    CUSTOMER_ACCOUNTS_ENABLED: "true",
    CUSTOMER_VERIFICATION_DELIVERY_ENABLED: "false",
  }), false);
  assert.equal(customerAccountsAvailable({
    NODE_ENV: "production",
    CUSTOMER_ACCOUNTS_ENABLED: "true",
    CUSTOMER_VERIFICATION_DELIVERY_ENABLED: "true",
  }), true);
});
