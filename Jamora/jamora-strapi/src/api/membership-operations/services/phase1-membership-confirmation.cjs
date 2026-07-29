"use strict";

function createPhase1MembershipConfirmation(activateMembership) {
  return {
    confirm({ membershipId, paymentDocumentId, now = new Date() }) {
      return activateMembership({
        membershipId,
        paymentDocumentId,
        now,
        idempotencyKey: `activation:${paymentDocumentId}`,
      });
    },
  };
}

module.exports = { createPhase1MembershipConfirmation };
