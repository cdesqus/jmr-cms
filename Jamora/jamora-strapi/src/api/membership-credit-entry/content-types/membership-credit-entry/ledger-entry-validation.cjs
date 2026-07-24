"use strict";

const ORDINARY_KINDS = new Set([
  "grant",
  "reserve",
  "release",
  "redeem",
  "reverse",
  "expire",
]);

function validateLedgerEntry(data) {
  if (!data || typeof data !== "object") throw new TypeError("ledger entry is required.");
  if (data.kind === "admin_adjustment") {
    if (!Number.isSafeInteger(data.creditDelta)) {
      throw new TypeError("creditDelta must be a signed safe integer.");
    }
    if (typeof data.reason !== "string" || !data.reason.trim()) {
      throw new TypeError("reason is required for admin_adjustment.");
    }
    return;
  }
  if (!ORDINARY_KINDS.has(data.kind)) throw new TypeError("kind is invalid.");
  if (!Number.isSafeInteger(data.credits) || data.credits < 0) {
    throw new TypeError("credits must be a safe non-negative integer.");
  }
}

module.exports = { validateLedgerEntry };
