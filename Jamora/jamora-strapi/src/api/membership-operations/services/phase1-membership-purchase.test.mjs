import test from "node:test";
import assert from "node:assert/strict";
import { preparePhase1MembershipPurchase } from "./phase1-membership-purchase.cjs";

test("the Phase 1 auto-confirm adapter remains isolated for tests", async () => {
  const pending = {
    documentId: "membership-1",
    customerDocumentId: "customer-1",
    planDocumentId: "plan-1",
    renewalOfMembershipDocumentId: null,
    status: "pending_payment",
  };
  let confirmed;
  const result = await preparePhase1MembershipPurchase({
    findPlan: async () => ({
      documentId: "plan-1",
      active: true,
      name: "Balance",
      durationMonths: 3,
      packageCredits: 3,
      eligibleProductSlugs: ["beras-kencur"],
      priceEurMinor: 2_000,
      priceRonMinor: 10_000,
    }),
    findMembership: async () => null,
    findByPaymentReference: async () => null,
    createMembership: async () => pending,
    confirm: async (input) => {
      confirmed = input;
      return { membership: { ...pending, status: "active" } };
    },
    randomUUID: () => "abcdefgh",
  }, {
    customerDocumentId: "customer-1",
    planDocumentId: "plan-1",
    operation: "purchase",
    idempotencyKey: "phase1-test",
  });
  assert.equal(result.membership.status, "active");
  assert.equal(result.mockConfirmed, true);
  assert.deepEqual(confirmed, {
    membershipId: "membership-1",
    paymentDocumentId: result.paymentDocumentId,
  });
});
