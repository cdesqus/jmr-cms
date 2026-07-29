import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { reminderSchedule } = createRequire(import.meta.url)("./lifecycle-policy.cjs");
test("requires email and lifecycle consent", () => assert.deepEqual(reminderSchedule({ email: "", consent: true, cartUpdatedAt: new Date(0).toISOString(), now: 10 ** 12 }), []));
test("schedules one-hour and twenty-four-hour reminders idempotently", () => {
  const rows = reminderSchedule({ email: "a@b.test", consent: true, cartUpdatedAt: new Date(0).toISOString(), now: 24 * 60 * 60 * 1000 });
  assert.deepEqual(rows.map((x) => x.template), ["abandoned_cart_1", "abandoned_cart_2"]);
  assert.deepEqual(reminderSchedule({ email: "a@b.test", consent: true, cartUpdatedAt: new Date(0).toISOString(), now: 24 * 60 * 60 * 1000, sent: ["abandoned_cart_1"] }).map((x) => x.template), ["abandoned_cart_2"]);
});
