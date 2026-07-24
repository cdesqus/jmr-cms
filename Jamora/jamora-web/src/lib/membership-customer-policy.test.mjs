import test from "node:test";
import assert from "node:assert/strict";
import {
  customerMembershipPath,
  membershipCustomerBoundary,
  membershipDashboard,
  membershipOperationBody,
  trustedMembershipHeaders,
} from "./membership-customer-policy.cjs";

test("trusted membership headers overwrite caller-controlled values", () => {
  const headers = trustedMembershipHeaders({
    "x-jamora-storefront-secret": "forged",
    "x-jamora-customer-document-id": "forged",
    "x-jamora-customer-session-version": "999",
    accept: "application/json",
  }, "real-secret", { documentId: "customer-1", sessionVersion: 0 });
  assert.equal(headers.get("x-jamora-storefront-secret"), "real-secret");
  assert.equal(headers.get("x-jamora-customer-document-id"), "customer-1");
  assert.equal(headers.get("x-jamora-customer-session-version"), "0");
});

test("returns exact disabled and no-session boundary states", () => {
  assert.deepEqual(membershipCustomerBoundary({ MEMBERSHIP_ENABLED: "TRUE" }, { documentId: "c1" }), {
    status: 404, error: "Not found.",
  });
  assert.deepEqual(membershipCustomerBoundary({ MEMBERSHIP_ENABLED: "true" }, null), {
    status: 401, error: "Authentication required.",
  });
  assert.equal(membershipCustomerBoundary({ MEMBERSHIP_ENABLED: "true" }, { documentId: "c1" }), null);
});

test("allows only the customer membership route and method allowlist", () => {
  assert.equal(customerMembershipPath("GET", ["plans"]), "/api/jamora/membership/plans");
  assert.equal(customerMembershipPath("GET", ["me"]), "/api/jamora/membership/me");
  assert.equal(customerMembershipPath("POST", ["purchase"]), "/api/jamora/membership/purchase");
  assert.equal(customerMembershipPath("POST", ["renew"]), "/api/jamora/membership/renew");
  assert.throws(() => customerMembershipPath("POST", ["me"]), /not found/i);
  assert.throws(() => customerMembershipPath("GET", ["reserve"]), /not found/i);
  assert.throws(() => customerMembershipPath("GET", ["..", "admin"]), /not found/i);
});

test("strips browser identity and validates purchase and renewal bodies", () => {
  assert.deepEqual(membershipOperationBody("purchase", {
    planDocumentId: "plan-1",
    idempotencyKey: "purchase:abc",
    customerDocumentId: "forged",
  }), { planDocumentId: "plan-1", idempotencyKey: "purchase:abc" });
  assert.deepEqual(membershipOperationBody("renew", {
    planDocumentId: "plan-2",
    membershipDocumentId: "membership-1",
    idempotencyKey: "renew:abc",
    sessionVersion: 999,
  }), {
    planDocumentId: "plan-2",
    membershipDocumentId: "membership-1",
    idempotencyKey: "renew:abc",
  });
  assert.throws(() => membershipOperationBody("purchase", { planDocumentId: "" }), /invalid/i);
});

test("derives dashboard totals only from authoritative ledger entries", () => {
  const view = membershipDashboard({
    documentId: "m1",
    status: "active",
    cachedRemainingCredits: 99,
    planSnapshot: { packageCredits: 7, eligibleProductSlugs: ["beras-kencur"] },
    creditEntries: [
      { kind: "grant", credits: 7 },
      { kind: "reserve", credits: 2 },
      { kind: "release", credits: 1 },
      { kind: "redeem", credits: 1 },
      { kind: "expire", credits: 2 },
    ],
  });
  assert.deepEqual(view.totals, {
    remaining: 4,
    reserved: 0,
    redeemed: 1,
    expired: 2,
  });
  assert.equal(view.canRedeem, true);
});

test("distinguishes pending and expired memberships and fails without a ledger", () => {
  assert.equal(membershipDashboard({
    documentId: "pending", status: "pending_payment", planSnapshot: {},
    creditEntries: [],
  }).state, "pending");
  const expired = membershipDashboard({
    documentId: "expired", status: "expired", planSnapshot: {},
    creditEntries: [{ kind: "grant", credits: 1 }, { kind: "expire", credits: 1 }],
  });
  assert.equal(expired.canRedeem, false);
  assert.equal(expired.state, "expired");
  assert.throws(() => membershipDashboard({
    documentId: "m1", status: "active", cachedRemainingCredits: 5, planSnapshot: {},
  }), /ledger/i);
});
