import assert from "node:assert/strict";
import test from "node:test";
import {
  createMembershipTransactions,
  createMemoryMembershipAdapter,
} from "./membership-transaction.cjs";

const enabled = { MEMBERSHIP_ENABLED: "true" };
const operationsFor = (adapter) => createMembershipTransactions(adapter, enabled);

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
  const operations = operationsFor(adapter);
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
  await operations.releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "release:c1" });
  assert.equal(adapter.entries.filter((entry) => entry.kind === "reserve").length, 1);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 3);
});

test("only one concurrent reservation succeeds when balance is insufficient for both", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = operationsFor(adapter);
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
  const operations = operationsFor(adapter);
  await assert.rejects(
    operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" }),
    /simulated create failure/,
  );
  assert.equal(adapter.entries.filter((entry) => entry.kind === "reserve").length, 0);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 3);
});

test("redeem links the order and consumes an existing reservation without changing balance", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = operationsFor(adapter);
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c2", credits: 2, idempotencyKey: "reserve:c2" });
  const result = await operations.redeemCredits({ membershipId: "m1", checkoutReference: "c2", orderId: "o2", idempotencyKey: "redeem:c2" });
  assert.equal(result.entry.orderDocumentId, "o2");
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 1);
});

test("expiry posts one idempotent entry and zeros remaining credits", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [{ ...active, endsAt: "2026-02-01T00:00:00.000Z" }] });
  const operations = operationsFor(adapter);
  await operations.expireMembership({ membershipId: "m1", now: new Date("2026-03-01"), idempotencyKey: "expire:m1" });
  await operations.expireMembership({ membershipId: "m1", now: new Date("2026-03-01"), idempotencyKey: "expire:m1" });
  assert.equal(adapter.entries.filter((entry) => entry.kind === "expire").length, 1);
  assert.equal(adapter.memberships.get("m1").status, "expired");
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 0);
});

test("admin adjustment requires a reason", async () => {
  const operations = operationsFor(createMemoryMembershipAdapter({ memberships: [active] }));
  await assert.rejects(
    operations.adjustCredits({ membershipId: "m1", creditDelta: 1, reason: " ", actor: "owner", idempotencyKey: "adjust:1" }),
    /reason is required/,
  );
});

test("activation grants once and renewal activates a new membership", async () => {
  const old = { ...active, documentId: "old", planSnapshot: { packageCredits: 4, durationMonths: 3 } };
  const pending = { ...old, documentId: "new", status: "pending_payment", startsAt: null, endsAt: null, cachedRemainingCredits: 0 };
  const adapter = createMemoryMembershipAdapter({ memberships: [old, pending] });
  const operations = operationsFor(adapter);
  await operations.activateMembership({ membershipId: "new", paymentDocumentId: "pay-1", now: new Date("2026-04-01"), idempotencyKey: "activate:new" });
  await operations.activateMembership({ membershipId: "new", paymentDocumentId: "pay-1", now: new Date("2026-04-01"), idempotencyKey: "activate:new" });
  assert.equal(adapter.memberships.get("old").endsAt, old.endsAt);
  assert.equal(adapter.memberships.get("new").status, "active");
  assert.equal(adapter.entries.filter((entry) => entry.kind === "grant" && entry.membershipDocumentId === "new").length, 1);
});

test("direct transaction operations fail closed unless membership is exactly enabled", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  for (const env of [{}, { MEMBERSHIP_ENABLED: "TRUE" }, { MEMBERSHIP_ENABLED: "1" }]) {
    await assert.rejects(
      createMembershipTransactions(adapter, env).reserveCredits({
        membershipId: "m1", checkoutReference: "disabled", credits: 1, idempotencyKey: `disabled:${env.MEMBERSHIP_ENABLED}`,
      }),
      /not found/i,
    );
  }
  assert.equal(adapter.entries.filter((entry) => entry.kind === "reserve").length, 0);
  await assert.rejects(
    createMembershipTransactions(adapter, {}).adjustCredits({}),
    /not found/i,
  );
});

test("idempotency keys reject a different operation, membership, or immutable payload", async () => {
  const second = { ...active, documentId: "m2" };
  const operations = operationsFor(createMemoryMembershipAdapter({ memberships: [active, second] }));
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 1, idempotencyKey: "shared" });
  await assert.rejects(operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "shared" }), /idempotency key conflict/i);
  await assert.rejects(operations.reserveCredits({ membershipId: "m2", checkoutReference: "c1", credits: 1, idempotencyKey: "shared" }), /idempotency key conflict/i);
  await assert.rejects(operations.releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "shared" }), /idempotency key conflict/i);
});

test("admin adjustment idempotency cannot be replayed by a different actor", async () => {
  const operations = operationsFor(createMemoryMembershipAdapter({ memberships: [active] }));
  await operations.adjustCredits({ membershipId: "m1", creditDelta: 1, reason: "courtesy", actor: "owner-a", idempotencyKey: "adjust:1" });
  await assert.rejects(
    operations.adjustCredits({ membershipId: "m1", creditDelta: 1, reason: "courtesy", actor: "owner-b", idempotencyKey: "adjust:1" }),
    /idempotency key conflict/i,
  );
});

test("a reservation permits exactly one release even with fresh idempotency keys", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = operationsFor(adapter);
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
  await operations.releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "release:1" });
  await assert.rejects(operations.releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "release:2" }), /already settled/i);
  await assert.rejects(operations.redeemCredits({ membershipId: "m1", checkoutReference: "c1", orderId: "o1", idempotencyKey: "redeem:1" }), /already settled/i);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 3);
});

test("a reservation permits exactly one redeem and cannot then be released", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = operationsFor(adapter);
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
  await operations.redeemCredits({ membershipId: "m1", checkoutReference: "c1", orderId: "o1", idempotencyKey: "redeem:1" });
  await assert.rejects(operations.redeemCredits({ membershipId: "m1", checkoutReference: "c1", orderId: "o1", idempotencyKey: "redeem:2" }), /already settled/i);
  await assert.rejects(operations.releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "release:1" }), /already settled/i);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 1);
});

test("concurrent terminal operations allow only one settlement", async () => {
  const adapter = createMemoryMembershipAdapter({ memberships: [active] });
  const operations = operationsFor(adapter);
  await operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
  const results = await Promise.allSettled([
    operations.releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "release:1" }),
    operations.redeemCredits({ membershipId: "m1", checkoutReference: "c1", orderId: "o1", idempotencyKey: "redeem:1" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
});

test("authoritative ledger balance repairs stale cache during reservation and expiry", async () => {
  const staleActive = { ...active, cachedRemainingCredits: 99 };
  const adapter = createMemoryMembershipAdapter({
    memberships: [staleActive],
    entries: [{ entryId: "g1", idempotencyKey: "g1", membershipDocumentId: "m1", kind: "grant", credits: 3, actor: "payment", occurredAt: active.startsAt }],
  });
  const operations = operationsFor(adapter);
  await assert.rejects(
    operations.reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 4, idempotencyKey: "reserve:c1" }),
    /insufficient/i,
  );
  adapter.memberships.get("m1").endsAt = "2026-02-01T00:00:00.000Z";
  await operations.expireMembership({ membershipId: "m1", now: new Date("2026-03-01"), idempotencyKey: "expire:m1" });
  assert.equal(adapter.entries.find((entry) => entry.kind === "expire").credits, 3);
  assert.equal(adapter.memberships.get("m1").cachedRemainingCredits, 0);
});

test("concurrent activation with different keys grants only once", async () => {
  const pending = { ...active, status: "pending_payment", startsAt: null, endsAt: null, cachedRemainingCredits: 0, planSnapshot: { packageCredits: 3, durationMonths: 3 } };
  const adapter = createMemoryMembershipAdapter({ memberships: [pending] });
  const operations = operationsFor(adapter);
  const results = await Promise.allSettled([
    operations.activateMembership({ membershipId: "m1", paymentDocumentId: "pay-1", now: new Date("2026-04-01"), idempotencyKey: "activate:1" }),
    operations.activateMembership({ membershipId: "m1", paymentDocumentId: "pay-1", now: new Date("2026-04-01"), idempotencyKey: "activate:2" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(adapter.entries.filter((entry) => entry.kind === "grant").length, 1);
});
