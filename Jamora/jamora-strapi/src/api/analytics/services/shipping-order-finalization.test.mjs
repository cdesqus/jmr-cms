import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExistingOrderReplay,
  assertLiveReservationBinding,
  exactAllocationUpdate,
  reservationExpiryForSelection,
  requiredOrderReservationToken,
} from "./shipping-order-finalization.cjs";

const items = [{
  productId: "product-1",
  slug: "jamu-energy",
  sku: "JAMU-1",
  name: "Jamu Energy",
  qty: 2,
}];
const allocations = [{
  productDocumentId: "product-1",
  slug: "jamu-energy",
  sku: "JAMU-1",
  name: "Jamu Energy",
  batchDocumentId: "batch-1",
  batchNumber: "LOT-1",
  qty: 2,
}];
const now = new Date("2026-07-25T08:00:00.000Z");
const quote = {
  quoteId: `shq_${"A".repeat(43)}`,
  expiresAt: "2026-07-25T08:10:00.000Z",
};

test("shipping finalization requires an opaque reservation for legacy and pending orders", () => {
  for (const pendingPayment of [false, true]) {
    assert.throws(
      () => requiredOrderReservationToken("", {
        shippingEnabled: true,
        pendingPayment,
      }),
      /reservation/i,
    );
  }
  assert.equal(
    requiredOrderReservationToken(" rsv_live ", {
      shippingEnabled: true,
      pendingPayment: false,
    }),
    "rsv_live",
  );
  assert.equal(
    requiredOrderReservationToken(undefined, {
      shippingEnabled: false,
      pendingPayment: false,
    }),
    undefined,
  );
});

test("a newly reserved order covers a valid selected quote without accepting unbounded expiry", () => {
  assert.equal(
    reservationExpiryForSelection(now, {
      expiresAt: "2026-07-25T08:14:00.000Z",
    }),
    "2026-07-25T08:14:00.000Z",
  );
  assert.equal(
    reservationExpiryForSelection(now, {
      expiresAt: "2099-07-25T08:14:00.000Z",
    }),
    "2026-07-25T08:15:00.000Z",
  );
  assert.equal(
    reservationExpiryForSelection(now, undefined),
    "2026-07-25T08:10:00.000Z",
  );
});

test("live reservation binding rejects expired, consumed, customer, allocation, and quote lifetime mismatches", () => {
  const base = {
    token: "rsv_live",
    status: "reserved",
    expiresAt: "2026-07-25T08:10:00.000Z",
    email: "ana@example.com",
    allocations,
  };
  const input = {
    token: "rsv_live",
    items,
    email: "Ana@Example.com",
    orderNumber: "JMR-1",
    shippingQuote: quote,
    now,
  };
  assert.deepEqual(
    assertLiveReservationBinding(base, input),
    allocations,
  );
  assert.throws(
    () => assertLiveReservationBinding({ ...base, status: "consumed" }, input),
    /expired|used/i,
  );
  assert.throws(
    () => assertLiveReservationBinding({
      ...base,
      expiresAt: now.toISOString(),
    }, input),
    /expired/i,
  );
  assert.throws(
    () => assertLiveReservationBinding(base, {
      ...input,
      email: "attacker@example.com",
    }),
    /customer/i,
  );
  assert.throws(
    () => assertLiveReservationBinding({
      ...base,
      customerDocumentId: "customer-1",
    }, {
      ...input,
      customerDocumentId: "customer-2",
    }),
    /customer/i,
  );
  assert.throws(
    () => assertLiveReservationBinding({
      ...base,
      orderNumber: "JMR-OTHER",
    }, input),
    /order/i,
  );
  assert.throws(
    () => assertLiveReservationBinding({
      ...base,
      allocations: [{ ...allocations[0], qty: 1 }],
    }, input),
    /match/i,
  );
  assert.throws(
    () => assertLiveReservationBinding({
      ...base,
      allocations: [{
        ...allocations[0],
        productDocumentId: "product-attacker",
      }],
    }, input),
    /product|match/i,
  );
  assert.throws(
    () => assertLiveReservationBinding(base, {
      ...input,
      shippingQuote: {
        ...quote,
        expiresAt: "2026-07-25T08:10:00.001Z",
      },
    }),
    /outlive/i,
  );
});

test("duplicate shipping responses require the original order-bound capability", () => {
  const reservation = {
    token: "rsv_live",
    status: "consumed",
    orderNumber: "JMR-1",
    email: "ana@example.com",
    customerDocumentId: "customer-1",
    allocations,
  };
  const order = {
    orderNumber: "JMR-1",
    status: "paid",
    reservationToken: "rsv_live",
    email: "ana@example.com",
    customerDocumentId: "customer-1",
    items,
  };
  assert.doesNotThrow(() => assertExistingOrderReplay(order, reservation, {
    token: "rsv_live",
    email: "ana@example.com",
    customerDocumentId: "customer-1",
    now,
  }));
  for (const changed of [
    { token: "rsv_attacker" },
    { email: "attacker@example.com" },
    { customerDocumentId: "customer-2" },
  ]) {
    assert.throws(
      () => assertExistingOrderReplay(order, reservation, {
        token: "rsv_live",
        email: "ana@example.com",
        customerDocumentId: "customer-1",
        now,
        ...changed,
      }),
      /binding|capability/i,
    );
  }
});

test("exact allocation updates fail closed instead of clamping batch or legacy stock", () => {
  assert.deepEqual(
    exactAllocationUpdate(allocations[0], {
      documentId: "batch-1",
      quantity: 7,
      reservedQuantity: 3,
      status: "active",
    }),
    {
      kind: "batch",
      documentId: "batch-1",
      quantity: 5,
      reservedQuantity: 1,
      status: "active",
    },
  );
  assert.throws(
    () => exactAllocationUpdate(allocations[0], {
      documentId: "batch-1",
      quantity: 1,
      reservedQuantity: 3,
    }),
    /unavailable/i,
  );
  assert.throws(
    () => exactAllocationUpdate(allocations[0], {
      documentId: "batch-1",
      quantity: 7,
      reservedQuantity: 1,
    }),
    /binding/i,
  );

  const legacy = {
    ...allocations[0],
    batchDocumentId: null,
    batchNumber: "LEGACY-STOCK",
  };
  assert.deepEqual(
    exactAllocationUpdate(legacy, {
      documentId: "product-1",
      stock: 4,
    }),
    {
      kind: "product",
      documentId: "product-1",
      stock: 2,
    },
  );
  assert.throws(
    () => exactAllocationUpdate(legacy, {
      documentId: "product-1",
      stock: 1,
    }),
    /unavailable/i,
  );
  assert.throws(
    () => exactAllocationUpdate(legacy, null),
    /binding/i,
  );
});
