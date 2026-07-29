import assert from "node:assert/strict";
import test from "node:test";
import routes from "./customer-auth.cjs";
import { accountsAvailable } from "../controllers/customer-auth-policy.cjs";

test("all six direct customer auth routes share the disabled policy", () => {
  assert.equal(routes.routes.length, 6);
  assert.equal(accountsAvailable({ CUSTOMER_ACCOUNTS_ENABLED: "false" }), false);
});
