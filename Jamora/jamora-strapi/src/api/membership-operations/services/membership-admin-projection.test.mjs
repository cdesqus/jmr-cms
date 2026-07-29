import test from "node:test";
import assert from "node:assert/strict";
import {
  listAdminMemberships,
  projectAdminMemberships,
} from "./membership-admin-projection.cjs";

test("derives admin balance from ledger entries even when cache is stale", () => {
  const [membership] = projectAdminMemberships(
    [{ documentId: "m1", cachedRemainingCredits: 99 }],
    [
      { entryId: "e1", membershipDocumentId: "m1", kind: "grant", credits: 7, actor: "system", occurredAt: "2026-07-01T00:00:00.000Z" },
      { entryId: "e2", membershipDocumentId: "m1", kind: "reserve", credits: 2, actor: "customer", occurredAt: "2026-07-02T00:00:00.000Z" },
      { entryId: "e3", membershipDocumentId: "m1", kind: "admin_adjustment", creditDelta: -1, actor: "owner@example.test", reason: "Correction", occurredAt: "2026-07-03T00:00:00.000Z" },
    ],
  );

  assert.equal(membership.cachedRemainingCredits, 99);
  assert.equal(membership.ledgerBalance, 4);
});

test("exposes bounded entry details and ordered adjustment audit history", () => {
  const [membership] = projectAdminMemberships(
    [{ documentId: "m1" }],
    [
      { entryId: "adjust-2", membershipDocumentId: "m1", kind: "admin_adjustment", creditDelta: 2, actor: "owner-2", reason: "Second", occurredAt: "2026-07-03T00:00:00.000Z" },
      { entryId: "grant", membershipDocumentId: "m1", kind: "grant", credits: 5, actor: "system", occurredAt: "2026-07-01T00:00:00.000Z" },
      { entryId: "adjust-1", membershipDocumentId: "m1", kind: "admin_adjustment", creditDelta: -1, actor: "owner-1", reason: "First", occurredAt: "2026-07-02T00:00:00.000Z" },
    ],
  );

  assert.equal(membership.creditEntries.length, 3);
  assert.deepEqual(membership.adjustmentHistory, [
    { entryId: "adjust-2", kind: "admin_adjustment", creditDelta: 2, actor: "owner-2", reason: "Second", occurredAt: "2026-07-03T00:00:00.000Z" },
    { entryId: "adjust-1", kind: "admin_adjustment", creditDelta: -1, actor: "owner-1", reason: "First", occurredAt: "2026-07-02T00:00:00.000Z" },
  ]);
});

test("rejects entries outside the requested membership set", () => {
  assert.throws(
    () => projectAdminMemberships(
      [{ documentId: "m1" }],
      [{ entryId: "foreign", membershipDocumentId: "m2", kind: "grant", credits: 1, actor: "system", occurredAt: "2026-07-01T00:00:00.000Z" }],
    ),
    /unexpected membership/i,
  );
});

test("loads memberships once and ledger entries in bounded set pages", async () => {
  const membershipQueries = [];
  const ledgerQueries = [];
  const result = await listAdminMemberships({
    findMemberships: async (query) => {
      membershipQueries.push(query);
      return [{ documentId: "m1", cachedRemainingCredits: 50 }];
    },
    findEntries: async (query) => {
      ledgerQueries.push(query);
      return query.start === 0
        ? [{ entryId: "g1", membershipDocumentId: "m1", kind: "grant", credits: 3, actor: "system", occurredAt: "2026-07-01T00:00:00.000Z" }]
        : [];
    },
  }, { pageSize: 2, maximumEntries: 4 });

  assert.equal(membershipQueries.length, 1);
  assert.equal(membershipQueries[0].limit, 100);
  assert.equal(ledgerQueries.length, 1);
  assert.deepEqual(ledgerQueries[0].filters, { membershipDocumentId: { $in: ["m1"] } });
  assert.equal(result[0].ledgerBalance, 3);
});

test("fails closed instead of returning a partial ledger at the entry bound", async () => {
  await assert.rejects(
    () => listAdminMemberships({
      findMemberships: async () => [{ documentId: "m1" }],
      findEntries: async ({ start }) => [
        { entryId: `g${start}`, membershipDocumentId: "m1", kind: "grant", credits: 1, actor: "system", occurredAt: "2026-07-01T00:00:00.000Z" },
      ],
    }, { pageSize: 1, maximumEntries: 2 }),
    /exceeds the bounded admin view/i,
  );
});
