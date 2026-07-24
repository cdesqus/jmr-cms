"use strict";

const { normalisePlan } = require("./membership-domain.cjs");

function assertMembershipEnabled(env = process.env) {
  if (env.MEMBERSHIP_ENABLED !== "true") {
    const error = new Error("Not found.");
    error.code = "membership_disabled";
    throw error;
  }
}

function mergePlanPatch(existing, patch) {
  if (!existing) throw new Error("Membership plan not found.");
  return normalisePlan({
    name: existing.name,
    active: existing.active,
    durationMonths: Number(existing.durationMonths),
    packageCredits: existing.packageCredits,
    priceEurMinor: existing.priceEurMinor,
    priceRonMinor: existing.priceRonMinor,
    eligibleProductSlugs: existing.eligibleProductSlugs,
    ...patch,
  });
}

module.exports = { assertMembershipEnabled, mergePlanPatch };
