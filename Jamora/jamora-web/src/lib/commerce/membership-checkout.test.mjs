import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMembershipTotals,
  checkoutReference,
  membershipCartProjection,
  opaqueCheckoutReference,
} from "./membership-checkout.cjs";

const activeMembership = {
  status: "active",
  startsAt: "2026-07-01T00:00:00.000Z",
  endsAt: "2027-01-01T00:00:00.000Z",
};

test("covers eligible merchandise with credits while charging nonzero shipping", () => {
  assert.deepEqual(buildMembershipTotals({
    items: [{ qty: 2, unitPriceMinor: 3000, creditCost: 1, eligible: true }],
    availableCredits: 2, shippingMinor: 495,
    membership: activeMembership,
    now: new Date("2026-07-24T00:00:00.000Z"),
  }), {
    merchandiseMinor: 0, coveredMerchandiseMinor: 6000,
    creditsRequired: 2, shippingMinor: 495, totalMinor: 495,
  });
});

test("rejects ineligible, insufficient, expired, free-shipping, and mixed carts", () => {
  const base = {
    items: [{ qty: 1, unitPriceMinor: 3000, creditCost: 1, eligible: true }],
    availableCredits: 1, shippingMinor: 495,
    membership: activeMembership,
    now: new Date("2026-07-24T00:00:00.000Z"),
  };
  assert.throws(() => buildMembershipTotals({
    ...base, items: [{ ...base.items[0], eligible: false }],
  }), /eligible/i);
  assert.throws(() => buildMembershipTotals({ ...base, availableCredits: 0 }), /credits/i);
  assert.throws(() => buildMembershipTotals({
    ...base, membership: { ...activeMembership, endsAt: "2026-07-01T00:00:00.000Z" },
  }), /active/i);
  assert.throws(() => buildMembershipTotals({ ...base, shippingMinor: 0 }), /shipping/i);
  assert.throws(() => buildMembershipTotals({
    ...base, items: [...base.items, { qty: 1, unitPriceMinor: 100, ordinary: true }],
  }), /mixed/i);
});

test("rejects unsafe integer inputs and arithmetic overflow", () => {
  const base = {
    items: [{ qty: 1, unitPriceMinor: 3000, creditCost: 1, eligible: true }],
    availableCredits: 1, shippingMinor: 495, membership: activeMembership,
  };
  for (const input of [
    { ...base, availableCredits: 1.5 },
    { ...base, shippingMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, items: [{ ...base.items[0], qty: 1.5 }] },
    { ...base, items: [{ ...base.items[0], creditCost: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...base, items: [{ ...base.items[0], unitPriceMinor: Number.MAX_SAFE_INTEGER, qty: 2 }] },
  ]) assert.throws(() => buildMembershipTotals(input), /safe integer/i);
});

test("derives a stable opaque customer-scoped checkout reference", () => {
  const first = opaqueCheckoutReference("secret", "customer-1", "attempt-1");
  assert.equal(first, opaqueCheckoutReference("secret", "customer-1", "attempt-1"));
  assert.notEqual(first, opaqueCheckoutReference("secret", "customer-1", "attempt-2"));
  assert.equal(checkoutReference(first), first);
  assert.doesNotMatch(first, /customer|attempt/i);
  assert.throws(() => checkoutReference("customer-1:attempt-1"), /reference/i);
});

test("projects one non-contradictory membership cart summary", () => {
  assert.deepEqual(membershipCartProjection({
    selected: true,
    coveredMerchandiseMinor: 6000,
    shippingMinor: 495,
  }), {
    membership: true,
    merchandiseLabel: "Covered merchandise",
    merchandiseMinor: 6000,
    shippingMinor: 495,
    totalMinor: 495,
  });
  assert.equal(membershipCartProjection({
    selected: false,
    subtotalMinor: 6000,
    shippingMinor: 0,
    discountMinor: 100,
  }).totalMinor, 5900);
});
