"use strict";

function membershipAdminRow(membership) {
  const balance = membership?.ledgerBalance;
  return {
    ledgerBalance: Number.isSafeInteger(balance) ? String(balance) : "Unavailable",
    adjustmentHistory: Array.isArray(membership?.adjustmentHistory)
      ? membership.adjustmentHistory.map((entry) => ({
          entryId: entry.entryId,
          creditDelta: entry.creditDelta,
          actor: entry.actor,
          reason: entry.reason,
          occurredAt: entry.occurredAt,
        }))
      : [],
  };
}

async function settleMembershipMutation(work) {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Membership request failed.",
    };
  }
}

module.exports = { membershipAdminRow, settleMembershipMutation };
