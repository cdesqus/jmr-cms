import test from "node:test";
import assert from "node:assert/strict";
import {
  assertReservationAllocationBinding,
  settleOrdinaryOrder,
} from "./order-payment-settlement.cjs";

const payment = {
  documentId: "payment-1",
  orderDocumentId: "order-1",
  subjectId: "order-1",
  paidAt: "2026-07-25T10:00:00.000Z",
};

function setup(overrides = {}) {
  const calls = [];
  const order = {
    documentId: "order-1",
    orderNumber: "JMR-2026-1",
    status: "pending",
    paymentDocumentId: null,
    reservationToken: "reservation-1",
    promotionCode: "WELCOME10",
    items: [{ slug: "beras-kencur", qty: 2 }],
    statusHistory: [],
    ...overrides.order,
  };
  const adapter = {
    lockOrder: async () => structuredClone(order),
    assertBinding: () => calls.push("binding"),
    consumeReservation: async (token, orderNumber, items) =>
      calls.push(["reservation", token, orderNumber, items]),
    decrementProductStock: async (items, reference) =>
      calls.push(["stock", items, reference]),
    incrementPromotionUse: async (code) =>
      calls.push(["promotion", code]),
    updateOrder: async (_documentId, data) => {
      calls.push(["order", data]);
      return { ...order, ...data };
    },
    ...overrides.adapter,
  };
  return { adapter, calls, order };
}

test("verified ordinary settlement consumes inventory and promotion once before marking paid", async () => {
  const { adapter, calls } = setup();
  const result = await settleOrdinaryOrder(adapter, payment);

  assert.equal(result.order.status, "paid");
  assert.equal(result.order.paymentDocumentId, "payment-1");
  assert.equal(result.order.invoiceNumber, "INV-2026-1");
  assert.deepEqual(calls.slice(0, 4), [
    "binding",
    [
      "reservation",
      "reservation-1",
      "JMR-2026-1",
      [{ slug: "beras-kencur", qty: 2 }],
    ],
    ["stock", [{ slug: "beras-kencur", qty: 2 }], "JMR-2026-1"],
    ["promotion", "WELCOME10"],
  ]);
  assert.equal(calls[4][0], "order");
  assert.deepEqual(calls[4][1].statusHistory, [{
    type: "status",
    status: "paid",
    note: "Payment confirmed by verified settlement.",
    actor: "Payment",
    at: "2026-07-25T10:00:00.000Z",
  }]);
});

test("reservation allocations must cover exactly the order products and quantities", () => {
  assert.doesNotThrow(() => assertReservationAllocationBinding([
    { slug: "beras-kencur", qty: 1, batchDocumentId: "batch-1" },
    { slug: "beras-kencur", qty: 1, batchDocumentId: "batch-2" },
    { slug: "kunyit", qty: 1, batchDocumentId: null, batchNumber: "LEGACY-STOCK" },
  ], [
    { slug: "kunyit", qty: 1 },
    { slug: "beras-kencur", qty: 2 },
  ]));
  assert.throws(() => assertReservationAllocationBinding([
    { slug: "sku-a", qty: 1, batchDocumentId: "batch-a" },
  ], [
    { slug: "sku-b", qty: 1 },
  ]), /does not match/i);
  assert.throws(() => assertReservationAllocationBinding([
    { slug: "sku-a", qty: 1, batchDocumentId: "batch-a" },
  ], [
    { slug: "sku-a", qty: 2 },
  ]), /does not match/i);
});

test("exact paid replay is idempotent and never consumes inventory twice", async () => {
  const { adapter, calls } = setup({
    order: { status: "paid", paymentDocumentId: "payment-1" },
  });
  const result = await settleOrdinaryOrder(adapter, payment);
  assert.equal(result.idempotent, true);
  assert.deepEqual(calls, ["binding"]);
});

test("settlement fails closed without its live reservation or when inventory consumption fails", async () => {
  const missing = setup({ order: { reservationToken: "" } });
  await assert.rejects(
    settleOrdinaryOrder(missing.adapter, payment),
    /reservation binding/i,
  );
  assert.equal(missing.calls.some((call) => Array.isArray(call) && call[0] === "order"), false);

  const failed = setup({
    adapter: {
      consumeReservation: async () => {
        throw new Error("Reservation cannot be consumed.");
      },
    },
  });
  await assert.rejects(
    settleOrdinaryOrder(failed.adapter, payment),
    /cannot be consumed/i,
  );
  assert.equal(failed.calls.some((call) => Array.isArray(call) && call[0] === "order"), false);
});
