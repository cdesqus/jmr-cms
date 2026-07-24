import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAdjustmentInput,
  assertPlanInput,
  canManageMembership,
  isMembershipEnabled,
  membershipAdminPath,
} from "./membership-admin-policy.cjs";

test("membership is enabled only by the exact string true", () => {
  assert.equal(isMembershipEnabled({ MEMBERSHIP_ENABLED: "true" }), true);
  for (const value of [undefined, "TRUE", "1", " true"]) {
    assert.equal(isMembershipEnabled({ MEMBERSHIP_ENABLED: value }), false);
  }
});

test("only an authenticated owner can manage membership", () => {
  assert.equal(canManageMembership({ role: "owner" }), true);
  for (const identity of [null, { role: "content" }, { role: "warehouse" }, { role: "support" }]) {
    assert.equal(canManageMembership(identity), false);
  }
});

test("allows only the documented admin membership operations", () => {
  assert.equal(membershipAdminPath(["plans"]), "/api/jamora/admin/membership/plans");
  assert.equal(
    membershipAdminPath(["plans", "plan-1"]),
    "/api/jamora/admin/membership/plans/plan-1",
  );
  assert.equal(
    membershipAdminPath(["memberships", "member-1", "adjust"]),
    "/api/jamora/admin/memberships/member-1/adjust",
  );
  assert.equal(
    membershipAdminPath(["memberships", "expire-due"]),
    "/api/jamora/admin/memberships/expire-due",
  );
  assert.throws(() => membershipAdminPath(["memberships", "member-1"]), /not allowed/i);
  assert.throws(() => membershipAdminPath(["..", "orders"]), /not allowed/i);
});

test("validates plan minor units, credits, duration, and eligibility", () => {
  assert.deepEqual(assertPlanInput({
    name: "Balance 6",
    active: true,
    durationMonths: 6,
    priceEurMinor: 12900,
    priceRonMinor: 64178,
    packageCredits: 7,
    eligibleProductSlugs: ["beras-kencur"],
  }), {
    name: "Balance 6",
    active: true,
    durationMonths: 6,
    priceEurMinor: 12900,
    priceRonMinor: 64178,
    packageCredits: 7,
    eligibleProductSlugs: ["beras-kencur"],
  });
  assert.throws(() => assertPlanInput({
    name: "Bad", active: true, durationMonths: 4, priceEurMinor: 1,
    priceRonMinor: 1, packageCredits: 1, eligibleProductSlugs: ["x"],
  }), /duration/i);
  assert.throws(() => assertPlanInput({
    name: "Bad", active: true, durationMonths: 3, priceEurMinor: 1.5,
    priceRonMinor: 1, packageCredits: 1, eligibleProductSlugs: ["x"],
  }), /safe positive integer/i);
  assert.throws(() => assertPlanInput({
    name: "Bad", active: true, durationMonths: 3, priceEurMinor: 1,
    priceRonMinor: 1, packageCredits: 1, eligibleProductSlugs: [],
  }), /eligible product/i);
});

test("requires a non-zero signed integer adjustment and reason", () => {
  assert.deepEqual(assertAdjustmentInput({ creditDelta: -2, reason: "Damaged package" }), {
    creditDelta: -2,
    reason: "Damaged package",
  });
  assert.throws(() => assertAdjustmentInput({ creditDelta: 0, reason: "Correction" }), /non-zero signed integer/i);
  assert.throws(() => assertAdjustmentInput({ creditDelta: 1, reason: " " }), /reason/i);
});
