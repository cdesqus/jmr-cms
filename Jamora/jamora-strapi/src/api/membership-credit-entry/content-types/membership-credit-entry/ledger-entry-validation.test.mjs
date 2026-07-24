import test from "node:test";
import assert from "node:assert/strict";
import { validateLedgerEntry } from "./ledger-entry-validation.cjs";

test("accepts valid ordinary and admin ledger entries", () => {
  assert.doesNotThrow(() => validateLedgerEntry({
    kind: "reserve",
    credits: 2,
  }));
  assert.doesNotThrow(() => validateLedgerEntry({
    kind: "admin_adjustment",
    creditDelta: -2,
    reason: "Correct duplicate grant",
  }));
});

test("requires safe non-negative credits for ordinary entries", () => {
  assert.throws(() => validateLedgerEntry({ kind: "grant", credits: -1 }), /credits/);
  assert.throws(
    () => validateLedgerEntry({ kind: "reserve", credits: Number.MAX_SAFE_INTEGER + 1 }),
    /credits/,
  );
});

test("requires signed safe delta and reason for admin adjustments", () => {
  assert.throws(
    () => validateLedgerEntry({ kind: "admin_adjustment", creditDelta: 1 }),
    /reason/,
  );
  assert.throws(
    () => validateLedgerEntry({
      kind: "admin_adjustment",
      creditDelta: Number.MAX_SAFE_INTEGER + 1,
      reason: "Correction",
    }),
    /creditDelta/,
  );
});
