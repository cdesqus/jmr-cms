import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryMembershipCheckoutAdapter,
  createMembershipCheckoutService,
} from "./membership-checkout.cjs";

const membership = {
  documentId: "membership-1",
  customerDocumentId: "customer-1",
  status: "active",
  startsAt: "2026-07-01T00:00:00.000Z",
  endsAt: "2027-01-01T00:00:00.000Z",
  ledgerBalance: 3,
  eligibleProductSlugs: ["beras-kencur"],
};
const product = {
  documentId: "product-1", slug: "beras-kencur",
  priceCents: 3000, creditCost: 1, stock: 2,
};
const reserve = {
  customerDocumentId: "customer-1",
  membershipDocumentId: "membership-1",
  checkoutReference: "24b83a32-68b1-4db2-a6ad-2a3740053282",
  idempotencyKey: "reserve-1",
  items: [{ slug: "beras-kencur", qty: 2 }],
  shippingMinor: 0,
  now: new Date("2026-07-24T00:00:00.000Z"),
};

function fixture(extra = {}) {
  const adapter = createMemoryMembershipCheckoutAdapter({
    memberships: [membership],
    products: [product],
    ...extra,
  });
  return { adapter, service: createMembershipCheckoutService(adapter, { MEMBERSHIP_ENABLED: "true" }) };
}

test("persists authoritative customer, membership, stock, credit, and totals binding", async () => {
  const { adapter, service } = fixture();
  const result = await service.reserve(reserve);
  assert.deepEqual(result.totals, {
    merchandiseMinor: 0, coveredMerchandiseMinor: 6000,
    creditsRequired: 2, shippingMinor: 495, totalMinor: 495,
  });
  assert.equal(adapter.checkouts.get(reserve.checkoutReference).customerDocumentId, "customer-1");
  assert.equal(adapter.stock.get("product-1"), 0);
  assert.equal(adapter.creditReservations.get(reserve.checkoutReference).credits, 2);
});

test("rejects cross-customer membership, checkout, token, and order settlement", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  await assert.rejects(() => service.finalize({
    customerDocumentId: "customer-2",
    checkoutReference: checkout.checkoutReference,
    orderDocumentId: "order-1",
    idempotencyKey: "final-1",
  }), /not found/i);
  adapter.orders.set("order-foreign", {
    documentId: "order-foreign", customerDocumentId: "customer-2",
    checkoutReference: checkout.checkoutReference, status: "paid",
  });
  await assert.rejects(() => service.finalize({
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    orderDocumentId: "order-foreign",
    idempotencyKey: "final-2",
  }), /order/i);
});

test("ignores forged browser totals and derives paid snapshot from persisted checkout", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  adapter.orders.set("order-1", {
    documentId: "order-1", customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference, status: "paid",
  });
  const result = await service.finalize({
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    orderDocumentId: "order-1",
    idempotencyKey: "final-1",
    credits: 999,
    shippingMinor: 0,
    coveredMerchandiseMinor: 1,
  });
  assert.deepEqual(result.order.membershipSnapshot, {
    membershipDocumentId: "membership-1",
    checkoutReference: checkout.checkoutReference,
    creditsRedeemed: 2,
    coveredMerchandiseMinor: 6000,
    merchandiseMinor: 0,
    shippingMinor: 495,
  });
  assert.equal(result.order.totalCents, 495);
});

test("redemption failure leaves no paid fulfillable order and compensates stock and credit", async () => {
  const { adapter, service } = fixture({ failRedeem: true });
  const checkout = await service.reserve(reserve);
  adapter.orders.set("order-1", {
    documentId: "order-1", customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference, status: "paid",
  });
  await assert.rejects(() => service.finalize({
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    orderDocumentId: "order-1",
    idempotencyKey: "final-1",
  }), /redeem/i);
  assert.equal(adapter.orders.get("order-1").status, "failed");
  assert.equal(adapter.orders.get("order-1").nonFulfillable, true);
  assert.equal(adapter.stock.get("product-1"), 2);
  assert.equal(adapter.creditReservations.get(checkout.checkoutReference).status, "released");
});

test("payment/order creation failure releases stock and credit", async () => {
  const { adapter, service } = fixture({ failCreateOrder: true });
  const checkout = await service.reserve(reserve);
  await assert.rejects(() => service.finalize({
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "final-1",
  }), /payment/i);
  assert.equal(adapter.stock.get("product-1"), 2);
  assert.equal(adapter.creditReservations.get(checkout.checkoutReference).status, "released");
  assert.equal(adapter.checkouts.get(checkout.checkoutReference).status, "failed");
});

test("concurrent unique loss rolls back stock inflation and returns one checkout", async () => {
  const { adapter, service } = fixture({ forceUniqueLoss: true });
  const [first, second] = await Promise.all([
    service.reserve(reserve),
    service.reserve(reserve),
  ]);
  assert.equal(first.checkoutReference, second.checkoutReference);
  assert.equal(adapter.stock.get("product-1"), 0);
  assert.equal(adapter.checkouts.size, 1);
  assert.equal(adapter.creditReservations.size, 1);
});
