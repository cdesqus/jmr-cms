import test from "node:test";
import assert from "node:assert/strict";
import { prepareMembershipPurchase } from "./membership-purchase.cjs";

const plan = {
  documentId: "plan-1", active: true, name: "Balance 6", durationMonths: "6",
  packageCredits: 7, eligibleProductSlugs: ["beras-kencur"],
  priceEurMinor: 10000, priceRonMinor: 50000,
};

test("re-reads the pending winner after a concurrent unique conflict without auto-confirming", async () => {
  const winner = {
    documentId: "membership-winner", customerDocumentId: "customer-1",
    planDocumentId: "plan-1", renewalOf: null, status: "pending_payment",
  };
  let reads = 0;
  const result = await prepareMembershipPurchase({
    findPlan: async () => plan,
    findMembership: async () => null,
    findByPaymentReference: async () => (++reads === 1 ? null : winner),
    createMembership: async () => {
      const error = new Error("duplicate key value violates unique constraint");
      error.code = "23505";
      throw error;
    },
    confirm: async () => assert.fail("customer purchase must not auto-confirm"),
    randomUUID: () => "abcdefgh-0000",
  }, {
    customerDocumentId: "customer-1", planDocumentId: "plan-1",
    operation: "purchase", idempotencyKey: "retry-1",
  });
  assert.equal(result.membership.status, "pending_payment");
  assert.equal(result.paymentDocumentId.startsWith("phase1-mock:"), true);
});

test("rejects reuse when immutable purchase identity does not match", async () => {
  await assert.rejects(() => prepareMembershipPurchase({
    findPlan: async () => plan,
    findMembership: async () => null,
    findByPaymentReference: async () => ({
      documentId: "m1", customerDocumentId: "customer-1",
      planDocumentId: "different-plan", renewalOf: null,
    }),
    createMembership: async () => assert.fail("must not create"),
    confirm: async () => assert.fail("must not confirm"),
    randomUUID: () => "abcdefgh",
  }, {
    customerDocumentId: "customer-1", planDocumentId: "plan-1",
    operation: "purchase", idempotencyKey: "retry-1",
  }), /conflict/i);
});

test("purchase replay returns its pending persisted winner without current plan lookup", async () => {
  const winner = {
    documentId: "m1", customerDocumentId: "customer-1",
    planDocumentId: "plan-1", renewalOfMembershipDocumentId: null,
  };
  const result = await prepareMembershipPurchase({
    findPlan: async () => assert.fail("replay must not read the mutable plan"),
    findMembership: async () => assert.fail("purchase replay has no renewal lookup"),
    findByPaymentReference: async () => winner,
    createMembership: async () => assert.fail("must not create"),
    confirm: async () => assert.fail("customer purchase must not auto-confirm"),
    randomUUID: () => "abcdefgh",
  }, {
    customerDocumentId: "customer-1", planDocumentId: "plan-1",
    operation: "purchase", idempotencyKey: "retry-1",
  });
  assert.equal(result.membership, winner);
});

test("renewal replay does not depend on current plan or target availability", async () => {
  const winner = {
    documentId: "m2", customerDocumentId: "customer-1",
    planDocumentId: "plan-1", renewalOfMembershipDocumentId: "membership-previous",
  };
  const result = await prepareMembershipPurchase({
    findPlan: async () => assert.fail("replay must not read the mutable plan"),
    findMembership: async () => assert.fail("replay must not re-check renewal eligibility"),
    findByPaymentReference: async () => winner,
    createMembership: async () => assert.fail("must not create"),
    confirm: async () => assert.fail("customer renewal must not auto-confirm"),
    randomUUID: () => "abcdefgh",
  }, {
    customerDocumentId: "customer-1", planDocumentId: "plan-1",
    operation: "renew", renewalOf: "membership-previous", idempotencyKey: "retry-1",
  });
  assert.equal(result.membership, winner);
});
