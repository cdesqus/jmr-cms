import assert from "node:assert/strict";
import test from "node:test";
import { authorizeMembershipCustomer } from "./membership-customer-authorization.cjs";

const env = {
  MEMBERSHIP_ENABLED: "true",
  JAMORA_STOREFRONT_API_SECRET: "storefront-secret",
};

function context(headers = {}, request = {}) {
  return {
    request,
    get(name) {
      return headers[name.toLowerCase()] ?? "";
    },
  };
}

test("standards-compliant GET authorizes trusted customer session headers without a body", async () => {
  const ctx = context({
    "x-jamora-storefront-secret": "storefront-secret",
    "x-jamora-customer-document-id": "customer-1",
    "x-jamora-customer-session-version": "7",
  }, { method: "GET" });
  const calls = [];
  const customer = await authorizeMembershipCustomer(ctx, async (documentId, sessionVersion) => {
    calls.push([documentId, sessionVersion]);
    return { documentId };
  }, env);
  assert.deepEqual(calls, [["customer-1", 7]]);
  assert.equal(customer.documentId, "customer-1");
});

test("GET accepts canonical session version zero", async () => {
  const ctx = context({
    "x-jamora-storefront-secret": "storefront-secret",
    "x-jamora-customer-document-id": "customer-1",
    "x-jamora-customer-session-version": "0",
  }, { method: "GET" });
  const calls = [];
  const customer = await authorizeMembershipCustomer(ctx, async (...args) => {
    calls.push(args);
    return { documentId: "customer-1" };
  }, env);
  assert.deepEqual(calls, [["customer-1", 0]]);
  assert.equal(customer.documentId, "customer-1");
});

test("GET rejects missing trusted identity headers", async () => {
  const ctx = context({ "x-jamora-storefront-secret": "storefront-secret" }, { method: "GET" });
  let called = false;
  const customer = await authorizeMembershipCustomer(ctx, async () => { called = true; }, env);
  assert.equal(customer, null);
  assert.equal(called, false);
  assert.equal(ctx.status, 400);
});

test("GET rejects forged identity before session lookup when storefront secret is wrong", async () => {
  const ctx = context({
    "x-jamora-storefront-secret": "forged",
    "x-jamora-customer-document-id": "victim",
    "x-jamora-customer-session-version": "7",
  }, { method: "GET" });
  let called = false;
  const customer = await authorizeMembershipCustomer(ctx, async () => { called = true; }, env);
  assert.equal(customer, null);
  assert.equal(called, false);
  assert.equal(ctx.status, 401);
});

test("GET rejects malformed session versions without coercion", async () => {
  for (const value of ["7x", "-1", "1.5", "", "01", " 1", "9007199254740992"]) {
    const ctx = context({
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": value,
    }, { method: "GET" });
    const customer = await authorizeMembershipCustomer(ctx, async () => ({ documentId: "customer-1" }), env);
    assert.equal(customer, null);
    assert.equal(ctx.status, 400);
  }
});
