"use strict";

const { purchasePaymentReference } = require("./membership-purchase-key.cjs");

async function prepareMembershipPurchase(adapter, input) {
  const renewalOf = input.operation === "renew" ? input.renewalOf : "";
  const paymentDocumentId = purchasePaymentReference(
    input.customerDocumentId, input.operation, input.idempotencyKey, renewalOf,
  );
  const plan = await adapter.findPlan(input.planDocumentId);
  if (!plan?.active) throw new Error("Membership plan not found.");
  if (input.operation === "renew") {
    const previous = await adapter.findMembership(renewalOf);
    if (!previous || previous.customerDocumentId !== input.customerDocumentId) {
      throw new Error("Membership not found.");
    }
  }

  const reconcile = async () => {
    const existing = await adapter.findByPaymentReference(paymentDocumentId);
    if (!existing) return null;
    assertIdentity(existing, input, renewalOf);
    const activation = await adapter.confirm({
      membershipId: existing.documentId,
      paymentDocumentId,
    });
    return { membership: activation.membership, paymentDocumentId, mockConfirmed: true };
  };

  const existing = await reconcile();
  if (existing) return existing;

  let membership;
  try {
    membership = await adapter.createMembership({
      membershipNumber: `MEM-${adapter.randomUUID().slice(0, 8).toUpperCase()}`,
      customerDocumentId: input.customerDocumentId,
      planDocumentId: input.planDocumentId,
      renewalOfMembershipDocumentId: renewalOf || null,
      planSnapshot: snapshot(plan),
      status: "pending_payment",
      paymentDocumentId,
      cachedRemainingCredits: 0,
    });
  } catch (error) {
    const winner = await reconcile();
    if (winner) return winner;
    throw error;
  }
  const activation = await adapter.confirm({ membershipId: membership.documentId, paymentDocumentId });
  return { membership: activation.membership, paymentDocumentId, mockConfirmed: true };
}

function assertIdentity(membership, input, renewalOf) {
  if (
    membership.customerDocumentId !== input.customerDocumentId ||
    membership.planDocumentId !== input.planDocumentId ||
    (membership.renewalOfMembershipDocumentId ?? "") !== renewalOf
  ) {
    throw new Error("Membership purchase conflict.");
  }
}

function snapshot(plan) {
  return {
    name: plan.name,
    durationMonths: Number(plan.durationMonths),
    packageCredits: plan.packageCredits,
    eligibleProductSlugs: plan.eligibleProductSlugs,
    priceEurMinor: plan.priceEurMinor,
    priceRonMinor: plan.priceRonMinor,
  };
}

module.exports = { prepareMembershipPurchase };
