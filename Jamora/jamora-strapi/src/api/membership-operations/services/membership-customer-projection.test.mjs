import test from "node:test";
import assert from "node:assert/strict";
import { listCustomerMemberships } from "./membership-customer-projection.cjs";

test("returns owned memberships with authoritative bounded ledger data", async () => {
  const result = await listCustomerMemberships({
    findMemberships: async () => [{
      documentId: "m1", customerDocumentId: "customer-1",
      cachedRemainingCredits: 500, status: "active",
    }],
    findEntries: async () => [
      { membershipDocumentId: "m1", kind: "grant", credits: 7, occurredAt: "2026-01-01" },
      { membershipDocumentId: "m1", kind: "reserve", credits: 2, occurredAt: "2026-01-02" },
    ],
  }, "customer-1");
  assert.equal(result[0].ledgerBalance, 5);
  assert.equal(result[0].creditEntries.length, 2);
});

test("fails closed when the bounded ledger result is incomplete", async () => {
  await assert.rejects(() => listCustomerMemberships({
    findMemberships: async () => [{ documentId: "m1" }],
    findEntries: async () => [{ membershipDocumentId: "m1", kind: "grant", credits: 1 }],
  }, "customer-1", { pageSize: 1, maximumEntries: 2 }), /bounded/);
});
