import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMembershipCanReserve,
  ledgerBalance,
  normalisePlan,
  requiredCredits,
} from "./membership-domain.cjs";

test("accepts configurable 3, 6, and 12 month plans", () => {
  assert.deepEqual(normalisePlan({
    name: "Balance 6",
    durationMonths: 6,
    packageCredits: 7,
    priceEurMinor: 12900,
    priceRonMinor: 64178,
    eligibleProductSlugs: ["beras-kencur"],
  }), {
    name: "Balance 6",
    durationMonths: 6,
    packageCredits: 7,
    priceEurMinor: 12900,
    priceRonMinor: 64178,
    eligibleProductSlugs: ["beras-kencur"],
    active: true,
  });
  assert.throws(() => normalisePlan({ durationMonths: 4 }), /durationMonths/);
});

test("rejects non-boolean explicit plan active values", () => {
  const plan = {
    name: "Balance 6",
    durationMonths: 6,
    packageCredits: 7,
    priceEurMinor: 12900,
    priceRonMinor: 64178,
    eligibleProductSlugs: [],
  };
  assert.throws(() => normalisePlan({ ...plan, active: "true" }), /active/);
  assert.throws(() => normalisePlan({ ...plan, active: 1 }), /active/);
});

test("derives balance from append-only signed entries", () => {
  assert.equal(ledgerBalance([
    { kind: "grant", credits: 7 },
    { kind: "reserve", credits: 2 },
    { kind: "release", credits: 1 },
    { kind: "redeem", credits: 1 },
    { kind: "expire", credits: 5 },
  ]), 1);
});

test("redeem finalizes a reserve without reducing available balance again", () => {
  assert.equal(ledgerBalance([
    { kind: "grant", credits: 2 },
    { kind: "reserve", credits: 1 },
    { kind: "redeem", credits: 1 },
  ]), 1);
});

test("supports signed admin adjustments only when a reason is supplied", () => {
  assert.equal(ledgerBalance([
    { kind: "grant", credits: 3 },
    { kind: "admin_adjustment", creditDelta: -2, reason: "Correct duplicate grant" },
  ]), 1);
  assert.throws(
    () => ledgerBalance([{ kind: "admin_adjustment", creditDelta: 1 }]),
    /reason/,
  );
});

test("rejects invalid ledger amounts", () => {
  assert.throws(() => ledgerBalance([{ kind: "grant", credits: -1 }]), /credits/);
  assert.throws(() => ledgerBalance([{ kind: "unknown", credits: 1 }]), /kind/);
});

test("rejects positive and negative cumulative ledger overflow", () => {
  assert.throws(() => ledgerBalance([
    { kind: "grant", credits: Number.MAX_SAFE_INTEGER },
    { kind: "grant", credits: 1 },
  ]), /safe integer/);
  assert.throws(() => ledgerBalance([
    { kind: "reserve", credits: Number.MAX_SAFE_INTEGER },
    { kind: "reserve", credits: 1 },
  ]), /safe integer/);
});

test("calculates product credit cost and rejects insufficient active membership", () => {
  assert.equal(requiredCredits([
    { qty: 2, creditCost: 1 },
    { qty: 1, creditCost: 2 },
  ]), 4);
  assert.doesNotThrow(() => assertMembershipCanReserve(
    {
      status: "active",
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2027-01-01T00:00:00.000Z",
    },
    5,
    4,
    new Date("2026-07-24T00:00:00.000Z"),
  ));
  assert.throws(() => assertMembershipCanReserve(
    {
      status: "expired",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-07-01T00:00:00.000Z",
    },
    5,
    1,
    new Date("2026-07-24T00:00:00.000Z"),
  ), /active/);
});

test("requires positive item quantities and credit costs", () => {
  assert.throws(() => requiredCredits([{ qty: 0, creditCost: 1 }]), /qty/);
  assert.throws(() => requiredCredits([{ qty: 1, creditCost: 0 }]), /creditCost/);
});

test("rejects reservations outside membership dates or above balance", () => {
  const membership = {
    status: "active",
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2027-01-01T00:00:00.000Z",
  };
  assert.throws(
    () => assertMembershipCanReserve(membership, 3, 4, new Date("2026-07-24T00:00:00.000Z")),
    /balance/,
  );
  assert.throws(
    () => assertMembershipCanReserve(membership, 5, 1, new Date("2026-06-30T23:59:59.999Z")),
    /date/,
  );
});
