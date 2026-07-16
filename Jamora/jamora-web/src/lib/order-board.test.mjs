import test from "node:test";
import assert from "node:assert/strict";

import { ORDER_STATUS_TABS, filterOrdersByStatus } from "./order-board.cjs";

test("exposes every business order status as its own tab", () => {
  assert.deepEqual(ORDER_STATUS_TABS.map((tab) => tab.label), [
    "All",
    "Pending",
    "Paid",
    "Processing",
    "Shipped",
    "Fulfilled",
    "Failed",
    "Refunded",
  ]);
});

test("filters by status while preserving order and customer search", () => {
  const orders = [
    { status: "pending", orderNumber: "JMR-001", customerName: "Alya" },
    { status: "paid", orderNumber: "JMR-002", customerName: "Bima" },
    { status: "paid", orderNumber: "JMR-003", customerName: "Citra" },
  ];

  assert.deepEqual(filterOrdersByStatus(orders, "paid", "citra"), [orders[2]]);
  assert.deepEqual(filterOrdersByStatus(orders, "all", "jmr"), orders);
});
