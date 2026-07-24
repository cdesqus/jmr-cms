import assert from "node:assert/strict";
import test from "node:test";
import { assertMembershipEnabled, mergePlanPatch } from "./membership-service-contract.cjs";

test("direct service gate accepts exact true only", () => {
  assert.doesNotThrow(() => assertMembershipEnabled({ MEMBERSHIP_ENABLED: "true" }));
  for (const env of [{}, { MEMBERSHIP_ENABLED: "TRUE" }, { MEMBERSHIP_ENABLED: "1" }]) {
    assert.throws(() => assertMembershipEnabled(env), /not found/i);
  }
});

test("plan PATCH merges persisted fields before normalizing", () => {
  const existing = {
    name: "Quarterly",
    active: true,
    durationMonths: "3",
    packageCredits: 6,
    priceEurMinor: 1200,
    priceRonMinor: 6000,
    eligibleProductSlugs: ["tea"],
  };
  assert.deepEqual(mergePlanPatch(existing, { active: false }), {
    name: "Quarterly",
    active: false,
    durationMonths: 3,
    packageCredits: 6,
    priceEurMinor: 1200,
    priceRonMinor: 6000,
    eligibleProductSlugs: ["tea"],
  });
});
