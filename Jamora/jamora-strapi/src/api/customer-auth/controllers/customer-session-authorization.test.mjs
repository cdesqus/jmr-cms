import assert from "node:assert/strict";
import test from "node:test";
import { authorizeCustomerSession } from "./customer-session-authorization.cjs";
import { createCustomerAuthLimiter } from "./customer-auth-limiter.cjs";

test("unauthenticated session calls fail before consuming auth limiter state", () => {
  const limiter = createCustomerAuthLimiter({ limit: 1 });
  const ctx = { get: () => "wrong" };
  assert.equal(authorizeCustomerSession(ctx, {
    CUSTOMER_ACCOUNTS_ENABLED: "true",
    NODE_ENV: "development",
    JAMORA_STOREFRONT_API_SECRET: "secret",
  }), false);
  assert.equal(ctx.status, 401);
  assert.equal(limiter.bucketCount(), 0);
});
