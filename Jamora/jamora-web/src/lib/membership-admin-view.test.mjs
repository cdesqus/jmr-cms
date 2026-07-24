import test from "node:test";
import assert from "node:assert/strict";
import {
  membershipAdminRow,
  settleMembershipMutation,
} from "./membership-admin-view.cjs";

test("shows authoritative ledger balance and adjustment audit details", () => {
  assert.deepEqual(membershipAdminRow({
    cachedRemainingCredits: 99,
    ledgerBalance: 4,
    adjustmentHistory: [{
      entryId: "a1",
      kind: "admin_adjustment",
      creditDelta: -1,
      actor: "owner@example.test",
      reason: "Correction",
      occurredAt: "2026-07-03T00:00:00.000Z",
    }],
  }), {
    ledgerBalance: "4",
    adjustmentHistory: [{
      entryId: "a1",
      creditDelta: -1,
      actor: "owner@example.test",
      reason: "Correction",
      occurredAt: "2026-07-03T00:00:00.000Z",
    }],
  });
});

test("never presents cached credits as ledger balance when authority is absent", () => {
  assert.deepEqual(membershipAdminRow({
    cachedRemainingCredits: 99,
  }), {
    ledgerBalance: "Unavailable",
    adjustmentHistory: [],
  });
});

test("turns mutation rejection into displayable error state without rethrowing", async () => {
  assert.deepEqual(
    await settleMembershipMutation(async () => {
      throw new Error("Provider rejected adjustment.");
    }),
    { ok: false, error: "Provider rejected adjustment." },
  );
  assert.deepEqual(
    await settleMembershipMutation(async () => "saved"),
    { ok: true, value: "saved" },
  );
});
