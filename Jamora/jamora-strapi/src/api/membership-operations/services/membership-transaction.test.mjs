import assert from "node:assert/strict";
import test from "node:test";
import {
  createMembershipTransactions,
  createMemoryMembershipAdapter,
} from "./membership-transaction.cjs";

const active = {
  documentId: "m1",
  customerDocumentId: "customer-1",
  status: "active",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2027-01-01T00:00:00.000Z",
  cachedRemainingCredits: 3,
};

test("reserve is idempotent and release restores the balance", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = createMembershipTransactions(adapter);
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
  await operations.releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "release:c1" });
  assert.equal(adapter.entries.filter((entry) => entry.kind === "reserve").length, 1);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 3);
});

test("only one concurrent reservation succeeds when balance is insufficient for both", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = createMembershipTransactions(adapter);
  const results = await Promise.allSettled([
    operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" }),
    operations.reserveCredits({ membershipId: "m1", checkoutReference: "c2", credits: 2, idempotencyKey: "reserve:c2" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(adapter.entries.filter((entry) => entry.kind === "reserve").length, 1);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 1);
});

test("transaction failure rolls balance and ledger back together", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active], failCreate: true });
  const operations = createMembershipTransactions(adapter);
  await assert.rejects(
    operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" }),
    /simulated create failure/,
  );
  assert.equal(adapter.entries.length, 0);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 3);
});

test("redeem links the order and consumes an existing reservation without changing balance", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = createMembershipTransactions(adapter);
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c2", credits: 2, idempotencyKey: "reserve:c2" });
  const result = await operations.redeemCredits({ membershipId: "m1", checkoutReference: "c2", orderId: "o2", idempotencyKey: "redeem:c2" });
  assert.equal(result.entry.orderDocumentId, "o2");
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 1);
});

test("expiry posts one idempotent entry and zeros remaining credits", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [{ ...active, endsAt: "2026-02-01T00:00:00.000Z" }] });
  const operations = createMembershipTransactions(adapter);
  await operations.expireMembership({ membershipId: "m1", now: new Date("2026-03-01"), idempotencyKey: "expire:m1" });
  await operations.expireMembership({ membershipId: "m1", now: new Date("2026-03-01"), idempotencyKey: "expire:m1" });
  assert.equal(adapter.entries.filter((entry) => entry.kind === "expire").length, 1);
  assert.equal(adapter.memberships.get("m1").status, "expired");
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 0);
});

test("admin adjustment requires a reason", async () => {
  const operations = createMembershipTransactions(createMemoryMembershipAdapter({ memberships: [active] }));
  await assert.rejects(
    operations.adjustCredits({ membershipId: "m1", creditDelta: 1, reason: " ", actor: "owner", idempotencyKey: "adjust:1" }),
    /reason is required/,
  );
});

test("activation grants once and renewal activates a new membership", async () => {
  const old = { ...active, documentId: "old", planSnapshot: { packageCredits: 4, durationMonths: 3 } };
  const pending = { ...old, documentId: "new", status: "pending_payment", startsAt: null, endsAt: null, cachedRemainingCredits: 0 };
  const adapter = createMemoryMembershipAdapter({ memberships: [old, pending] });
  const operations = createMembershipTransactions(adapter);
  await operations.activateMembership({ membershipId: "new", paymentDocumentId: "pay-1", now: new Date("2026-04-01"), idempotencyKey: "activate:new" });
  await operations.activateMembership({ membershipId: "new", paymentDocumentId: "pay-1", now: new Date("2026-04-01"), idempotencyKey: "activate:new" });
  assert.equal(adapter.memberships.get("old").endsAt, old.endsAt);
  assert.equal(adapter.memberships.get("new").status, "active");
  assert.equal(adapter.entries.filter((entry) => entry.kind === "grant").length, 1);
});
