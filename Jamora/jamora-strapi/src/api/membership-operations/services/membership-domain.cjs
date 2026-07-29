"use strict";

const DELTA = Object.freeze({
  grant: 1,
  release: 1,
  reverse: 1,
  admin_adjustment: 1,
  reserve: -1,
  redeem: 0,
  expire: -1,
});

function assertSafeInteger(value, field, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${field} must be a safe integer of at least ${minimum}.`);
  }
}

function normalisePlan(input) {
  if (!input || typeof input !== "object") throw new TypeError("plan is required.");
  const durationMonths = Number(input.durationMonths);
  if (![3, 6, 12].includes(durationMonths)) {
    throw new TypeError("durationMonths must be 3, 6, or 12.");
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new TypeError("name is required.");
  }
  assertSafeInteger(input.packageCredits, "packageCredits", 1);
  assertSafeInteger(input.priceEurMinor, "priceEurMinor", 1);
  assertSafeInteger(input.priceRonMinor, "priceRonMinor", 1);
  if (
    !Array.isArray(input.eligibleProductSlugs)
    || input.eligibleProductSlugs.some((slug) => typeof slug !== "string" || !slug.trim())
  ) {
    throw new TypeError("eligibleProductSlugs must be an array of non-empty strings.");
  }
  if (input.active !== undefined && typeof input.active !== "boolean") {
    throw new TypeError("active must be a boolean.");
  }
  return {
    name: input.name,
    durationMonths,
    packageCredits: input.packageCredits,
    priceEurMinor: input.priceEurMinor,
    priceRonMinor: input.priceRonMinor,
    eligibleProductSlugs: [...input.eligibleProductSlugs],
    active: input.active ?? true,
  };
}

function ledgerBalance(entries) {
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array.");
  return entries.reduce((balance, entry) => {
    if (!entry || !Object.hasOwn(DELTA, entry.kind)) {
      throw new TypeError("kind is invalid.");
    }
    if (entry.kind === "admin_adjustment") {
      if (!Number.isSafeInteger(entry.creditDelta)) {
        throw new TypeError("creditDelta must be a signed safe integer.");
      }
      if (typeof entry.reason !== "string" || !entry.reason.trim()) {
        throw new TypeError("reason is required for admin_adjustment.");
      }
      return checkedAdd(balance, entry.creditDelta);
    }
    assertSafeInteger(entry.credits, "credits");
    return checkedAdd(balance, DELTA[entry.kind] * entry.credits);
  }, 0);
}

function checkedAdd(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new TypeError("cumulative ledger balance must remain a safe integer.");
  }
  return result;
}

function requiredCredits(items) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array.");
  return items.reduce((total, item) => {
    assertSafeInteger(item?.qty, "qty", 1);
    assertSafeInteger(item?.creditCost, "creditCost", 1);
    const subtotal = item.qty * item.creditCost;
    if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total + subtotal)) {
      throw new TypeError("required credits exceed the safe integer range.");
    }
    return total + subtotal;
  }, 0);
}

function assertMembershipCanReserve(membership, balance, credits, now = new Date()) {
  if (!membership || membership.status !== "active") {
    throw new Error("Membership must be active.");
  }
  assertSafeInteger(balance, "balance");
  assertSafeInteger(credits, "credits", 1);
  const instant = now instanceof Date ? now : new Date(now);
  const startsAt = new Date(membership.startsAt);
  const endsAt = new Date(membership.endsAt);
  if (
    Number.isNaN(instant.valueOf())
    || Number.isNaN(startsAt.valueOf())
    || Number.isNaN(endsAt.valueOf())
    || instant < startsAt
    || instant >= endsAt
  ) {
    throw new Error("Membership is outside its active date range.");
  }
  if (credits > balance) throw new Error("Insufficient membership balance.");
}

module.exports = {
  assertMembershipCanReserve,
  ledgerBalance,
  normalisePlan,
  requiredCredits,
};
