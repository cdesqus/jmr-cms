import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOrderTimeline } from "./order-timeline.cjs";

test("storefront timeline parses safe settlement events and bounds malformed fields", () => {
  assert.deepEqual(normalizeOrderTimeline([
    {
      id: "evt-payment-1-paid",
      status: "paid",
      createdAt: "2026-07-25T10:00:00.000Z",
      note: "Payment confirmed by verified settlement.",
      actor: "must-not-cross",
      arbitrary: { unsafe: true },
    },
    {
      status: "processing",
      createdAt: "not-a-date",
      note: 123,
    },
  ], "2026-07-25T09:00:00.000Z"), [
    {
      id: "evt-payment-1-paid",
      type: "status",
      status: "paid",
      createdAt: "2026-07-25T10:00:00.000Z",
      note: "Payment confirmed by verified settlement.",
    },
    {
      id: "evt-order-1",
      type: "status",
      status: "processing",
      createdAt: "2026-07-25T09:00:00.000Z",
    },
  ]);
});
