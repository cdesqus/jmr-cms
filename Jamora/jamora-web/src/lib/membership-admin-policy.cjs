"use strict";

function isMembershipEnabled(env = process.env) {
  return env.MEMBERSHIP_ENABLED === "true";
}

function canManageMembership(identity) {
  return identity?.role === "owner";
}

function membershipAdminPath(segments) {
  const path = Array.isArray(segments) ? segments : [];
  const allowed =
    (path.length === 1 && (path[0] === "plans" || path[0] === "memberships")) ||
    (path.length === 2 && path[0] === "plans" && safeSegment(path[1])) ||
    (path.length === 2 && path[0] === "memberships" && path[1] === "expire-due") ||
    (path.length === 2 && path[0] === "membership-checkouts" && path[1] === "expire-due") ||
    (path.length === 3 && path[0] === "memberships" && safeSegment(path[1]) && path[2] === "adjust");
  if (!allowed) throw new Error("Membership admin path is not allowed.");
  const prefix = path[0] === "plans"
    ? "/api/jamora/admin/membership"
    : "/api/jamora/admin";
  return `${prefix}/${path.map(encodeURIComponent).join("/")}`;
}

function assertPlanInput(input) {
  const name = text(input?.name);
  if (!name) throw new Error("Plan name is required.");
  if (![3, 6, 12].includes(Number(input?.durationMonths))) {
    throw new Error("Plan duration must be 3, 6, or 12 months.");
  }
  const result = {
    name,
    active: input?.active !== false,
    durationMonths: Number(input.durationMonths),
    priceEurMinor: positiveSafeInteger(input?.priceEurMinor, "EUR price"),
    priceRonMinor: positiveSafeInteger(input?.priceRonMinor, "RON price"),
    packageCredits: positiveSafeInteger(input?.packageCredits, "Package credits"),
    eligibleProductSlugs: Array.isArray(input?.eligibleProductSlugs)
      ? [...new Set(input.eligibleProductSlugs.map(text).filter(Boolean))]
      : [],
  };
  if (result.eligibleProductSlugs.length === 0) {
    throw new Error("At least one eligible product is required.");
  }
  return result;
}

function assertAdjustmentInput(input) {
  const creditDelta = Number(input?.creditDelta);
  if (!Number.isSafeInteger(creditDelta) || creditDelta === 0) {
    throw new Error("Credit adjustment must be a non-zero signed integer.");
  }
  const reason = text(input?.reason);
  if (!reason) throw new Error("Adjustment reason is required.");
  return { creditDelta, reason };
}

function positiveSafeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} must be a safe positive integer.`);
  }
  return number;
}

function safeSegment(value) {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." && !value.includes("/");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  assertAdjustmentInput,
  assertPlanInput,
  canManageMembership,
  isMembershipEnabled,
  membershipAdminPath,
};
