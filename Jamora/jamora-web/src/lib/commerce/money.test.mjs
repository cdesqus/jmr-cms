import test from "node:test";
import assert from "node:assert/strict";
import { createFxSnapshot, createMoney } from "./money.cjs";

test("normalises ISO currency and integer minor units", () => {
  assert.deepEqual(createMoney(1299, "ron"), { amountMinor: 1299, currency: "RON" });
});

test("captures an immutable EUR to RON checkout snapshot", () => {
  assert.deepEqual(createFxSnapshot({
    eurMinor: 2000,
    ronMinor: 9950,
    rate: "4.975000",
    source: "admin",
    capturedAt: "2026-07-24T10:00:00.000Z",
  }), {
    reference: { amountMinor: 2000, currency: "EUR" },
    charge: { amountMinor: 9950, currency: "RON" },
    rate: "4.975000",
    source: "admin",
    capturedAt: "2026-07-24T10:00:00.000Z",
  });
});

test("rejects fractional minor units and non-positive rates", () => {
  assert.throws(() => createMoney(1.2, "EUR"), /integer/);
  assert.throws(() => createFxSnapshot({
    eurMinor: 100, ronMinor: 0, rate: "0", source: "admin",
    capturedAt: "2026-07-24T10:00:00.000Z",
  }), /positive/);
});
