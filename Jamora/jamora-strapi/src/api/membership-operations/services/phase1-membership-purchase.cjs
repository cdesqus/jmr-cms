"use strict";

const { prepareMembershipPurchase } = require("./membership-purchase.cjs");

async function preparePhase1MembershipPurchase(adapter, input) {
  const prepared = await prepareMembershipPurchase(adapter, input);
  const activation = await adapter.confirm({
    membershipId: prepared.membership.documentId,
    paymentDocumentId: prepared.paymentDocumentId,
  });
  return {
    membership: activation.membership,
    paymentDocumentId: prepared.paymentDocumentId,
    mockConfirmed: true,
  };
}

module.exports = { preparePhase1MembershipPurchase };
