import test from "node:test";
import assert from "node:assert/strict";
import { createFxSnapshot, createMoney } from "./money.cjs";

test("normalises ISO currency and integer minor units", () => {
  assert.deepEqual(createMoney(1299, "ron"), { amountMinor: 1299, currency: "RON" });
});

test("rejects currencies outside the Romania launch boundary", () => {
  assert.throws(() => createMoney(1299, "ZZZ"), /EUR or RON/);
  assert.throws(() => createMoney(1299, "ABC"), /EUR or RON/);
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

test("rejects rates that are not finite positive base-10 decimal strings", () => {
  for (const rate of ["Infinity", "0x10", "1.2.3", "-1"]) {
    assert.throws(() => createFxSnapshot({
      eurMinor: 100, ronMinor: 498, rate, source: "admin",
      capturedAt: "2026-07-24T10:00:00.000Z",
    }), /positive base-10 decimal/);
  }
});

test("rejects non-ISO checkout snapshot timestamps", () => {
  assert.throws(() => createFxSnapshot({
    eurMinor: 100, ronMinor: 498, rate: "4.98", source: "admin",
    capturedAt: "July 24, 2026 10:00:00",
  }), /ISO datetime/);
});
