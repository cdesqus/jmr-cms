import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMembershipTotals,
  checkoutReference,
  createMembershipCheckout,
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
    availableCredits: 2,
    shippingMinor: 495,
    membership: activeMembership,
    now: new Date("2026-07-24T00:00:00.000Z"),
  }), {
    merchandiseMinor: 0,
    coveredMerchandiseMinor: 6000,
    creditsRequired: 2,
    shippingMinor: 495,
    totalMinor: 495,
  });
});

test("rejects ineligible, insufficient, expired, free-shipping, and mixed carts", () => {
  const base = {
    items: [{ qty: 1, unitPriceMinor: 3000, creditCost: 1, eligible: true }],
    availableCredits: 1,
    shippingMinor: 495,
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

test("rejects every unsafe integer input and arithmetic overflow", () => {
  const base = {
    items: [{ qty: 1, unitPriceMinor: 3000, creditCost: 1, eligible: true }],
    availableCredits: 1,
    shippingMinor: 495,
    membership: activeMembership,
  };
  for (const input of [
    { ...base, availableCredits: 1.5 },
    { ...base, shippingMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, items: [{ ...base.items[0], qty: 1.5 }] },
    { ...base, items: [{ ...base.items[0], creditCost: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...base, items: [{ ...base.items[0], unitPriceMinor: Number.MAX_SAFE_INTEGER, qty: 2 }] },
  ]) {
    assert.throws(() => buildMembershipTotals(input), /safe integer/i);
  }
});

test("accepts only opaque UUID checkout references", () => {
  assert.equal(
    checkoutReference("24b83a32-68b1-4db2-a6ad-2a3740053282"),
    "24b83a32-68b1-4db2-a6ad-2a3740053282",
  );
  assert.throws(() => checkoutReference("membership-1:customer@example.com"), /reference/i);
});

test("derives the same opaque reference for an idempotent customer attempt", () => {
  const first = opaqueCheckoutReference("secret", "customer-1", "attempt-1");
  assert.equal(first, opaqueCheckoutReference("secret", "customer-1", "attempt-1"));
  assert.notEqual(first, opaqueCheckoutReference("secret", "customer-1", "attempt-2"));
  assert.equal(checkoutReference(first), first);
  assert.doesNotMatch(first, /customer|attempt/i);
});

function coordinatorFixture(overrides = {}) {
  const calls = [];
  const adapter = {
    findCheckout: async () => null,
    reserveStock: async (input) => (calls.push(["reserveStock", input]), { token: "stock-1" }),
    releaseStock: async (input) => calls.push(["releaseStock", input]),
    reserveCredits: async (input) => (calls.push(["reserveCredits", input]), { entryId: "credit-1" }),
    releaseCredits: async (input) => calls.push(["releaseCredits", input]),
    payAndCreateOrder: async (input) => (calls.push(["payAndCreateOrder", input]), { documentId: "order-1" }),
    consumeStock: async (input) => calls.push(["consumeStock", input]),
    redeemCredits: async (input) => calls.push(["redeemCredits", input]),
    saveCheckout: async (input) => (calls.push(["saveCheckout", input]), input),
    ...overrides,
  };
  return { calls, checkout: createMembershipCheckout(adapter) };
}

const reservationInput = {
  checkoutReference: "24b83a32-68b1-4db2-a6ad-2a3740053282",
  idempotencyKey: "checkout-attempt-1",
  customerDocumentId: "customer-1",
  membershipDocumentId: "membership-1",
  creditsRequired: 2,
  items: [{ slug: "beras-kencur", qty: 2 }],
};

test("reserves stock before credits and returns a saved retry coherently", async () => {
  let saved;
  const { calls, checkout } = coordinatorFixture({
    findCheckout: async () => saved ?? null,
    saveCheckout: async (input) => (saved = input),
  });
  const first = await checkout.reserve(reservationInput);
  const retry = await checkout.reserve(reservationInput);
  assert.deepEqual(retry, first);
  assert.deepEqual(calls.map(([name]) => name), ["reserveStock", "reserveCredits"]);
  assert.equal(first.status, "reserved");
});

test("stock failure posts no credit entry", async () => {
  const { calls, checkout } = coordinatorFixture({
    reserveStock: async () => { throw new Error("out of stock"); },
  });
  await assert.rejects(() => checkout.reserve(reservationInput), /stock/i);
  assert.deepEqual(calls, []);
});

test("credit failure releases stock using a stable compensation key", async () => {
  const { calls, checkout } = coordinatorFixture({
    reserveCredits: async () => { throw new Error("credit rejected"); },
  });
  await assert.rejects(() => checkout.reserve(reservationInput), /credit/i);
  assert.deepEqual(calls.map(([name]) => name), ["reserveStock", "releaseStock"]);
  assert.match(calls[1][1].idempotencyKey, /:stock-release$/);
});

test("payment failure releases both reservations", async () => {
  const { calls, checkout } = coordinatorFixture({
    findCheckout: async () => ({ ...reservationInput, stockReservationToken: "stock-1", status: "reserved" }),
    payAndCreateOrder: async () => { throw new Error("payment failed"); },
  });
  await assert.rejects(() => checkout.finalize({
    checkoutReference: reservationInput.checkoutReference,
    idempotencyKey: "finalize-1",
    shippingMinor: 495,
    merchandiseMinor: 0,
  }), /payment/i);
  assert.deepEqual(calls.map(([name]) => name), ["releaseStock", "releaseCredits"]);
});

test("paid finalization consumes stock then redeems credits with immutable snapshots", async () => {
  const reserved = {
    ...reservationInput,
    stockReservationToken: "stock-1",
    coveredMerchandiseMinor: 6000,
    status: "reserved",
  };
  const { calls, checkout } = coordinatorFixture({ findCheckout: async () => reserved });
  const result = await checkout.finalize({
    checkoutReference: reservationInput.checkoutReference,
    idempotencyKey: "finalize-1",
    shippingMinor: 495,
    merchandiseMinor: 0,
  });
  assert.equal(result.status, "paid");
  assert.deepEqual(calls.map(([name]) => name), [
    "payAndCreateOrder", "consumeStock", "redeemCredits", "saveCheckout",
  ]);
  assert.deepEqual(calls[0][1].membershipSnapshot, {
    membershipDocumentId: "membership-1",
    creditsRedeemed: 2,
    coveredMerchandiseMinor: 6000,
  });
  assert.equal(calls[0][1].totalMinor, 495);
});

test("redeem failure compensates consumed stock and releases credits", async () => {
  const reserved = {
    ...reservationInput,
    stockReservationToken: "stock-1",
    coveredMerchandiseMinor: 6000,
    status: "reserved",
  };
  const { calls, checkout } = coordinatorFixture({
    findCheckout: async () => reserved,
    redeemCredits: async () => { throw new Error("redeem failed"); },
  });
  await assert.rejects(() => checkout.finalize({
    checkoutReference: reservationInput.checkoutReference,
    idempotencyKey: "finalize-1",
    shippingMinor: 495,
    merchandiseMinor: 0,
  }), /redeem/i);
  assert.deepEqual(calls.map(([name]) => name), [
    "payAndCreateOrder", "consumeStock", "releaseStock", "releaseCredits",
  ]);
  assert.equal(calls[2][1].consumed, true);
});
