import test from "node:test";
import assert from "node:assert/strict";
import { listCustomerMemberships } from "./membership-customer-projection.cjs";

test("returns owned memberships with authoritative bounded ledger data", async () => {
  const result = await listCustomerMemberships({
    findMemberships: async () => [{
      documentId: "m1", customerDocumentId: "customer-1",
      cachedRemainingCredits: 500, status: "active",
      paymentDocumentId: "secret-payment-reference",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
    }],
    findEntries: async () => [
      { membershipDocumentId: "m1", kind: "grant", credits: 7, actor: "internal@example.test", occurredAt: "2026-01-01" },
      { membershipDocumentId: "m1", kind: "reserve", credits: 2, occurredAt: "2026-01-02" },
    ],
  }, "customer-1");
  assert.equal(result[0].ledgerBalance, 5);
  assert.equal(result[0].creditEntries.length, 2);
  assert.equal(result[0].paymentDocumentId, undefined);
  assert.equal(result[0].cachedRemainingCredits, undefined);
  assert.equal(result[0].customerDocumentId, undefined);
  assert.equal(result[0].createdAt, undefined);
  assert.equal(result[0].creditEntries[0].actor, undefined);
});

test("fails closed when the bounded ledger result is incomplete", async () => {
  await assert.rejects(() => listCustomerMemberships({
    findMemberships: async () => [{ documentId: "m1" }],
    findEntries: async () => [{ membershipDocumentId: "m1", kind: "grant", credits: 1 }],
  }, "customer-1", { pageSize: 1, maximumEntries: 2 }), /bounded/);
});
