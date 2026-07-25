import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryMembershipCheckoutAdapter,
  createMembershipCheckoutService,
} from "./membership-checkout.cjs";
import { quoteShipping } from "../../shipping-operations/services/shipping-domain.cjs";

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
  priceCents: 3000, creditCost: 1, stock: 2, netWeight: "80 g",
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
  const { env = {}, ...adapterOptions } = extra;
  const adapter = createMemoryMembershipCheckoutAdapter({
    memberships: [membership],
    products: [product],
    ...adapterOptions,
  });
  return {
    adapter,
    service: createMembershipCheckoutService(adapter, {
      MEMBERSHIP_ENABLED: "true",
      ...env,
    }),
  };
}

test("shipping-enabled membership checkout uses only the selected authoritative RON quote", async () => {
  const shippingAddress = {
    recipient: "Ana Popescu",
    phone: "+40 712 345 678",
    countryCode: "RO",
    subdivisionCode: "CJ",
    locality: "Cluj-Napoca",
    postalCode: "400001",
    street: "Strada Memorandumului",
    building: "10",
    unit: "",
    instructions: "",
  };
  const quoteSecret = "membership-shipping-secret-at-least-32-bytes";
  const selection = quoteShipping({
    address: shippingAddress,
    items: reserve.items,
    products: [product],
  }, { secret: quoteSecret, now: reserve.now })[1];
  const { service } = fixture({
    env: {
      SHIPPING_ENABLED: "true",
      SHIPPING_QUOTE_SECRET: quoteSecret,
    },
  });

  const checkout = await service.reserve({
    ...reserve,
    shippingSelection: selection,
    shippingSnapshot: {
      customerName: "Ana Popescu",
      email: "ana@example.com",
      shippingAddressText: "forged text",
      shippingAddress,
      estimatedDelivery: "forged estimate",
    },
    shippingMinor: 1,
    currency: "EUR",
  });

  assert.equal(checkout.currency, "RON");
  assert.equal(checkout.totals.shippingMinor, selection.amountMinor);
  assert.equal(checkout.totals.totalMinor, selection.amountMinor);
  assert.equal(checkout.shippingSnapshot.quote.quoteId, selection.quoteId);
  assert.equal(checkout.shippingSnapshot.quote.currency, "RON");
  assert.deepEqual(checkout.shippingSnapshot.shippingAddress, shippingAddress);
  assert.match(checkout.shippingSnapshot.shippingAddressText, /Strada Memorandumului 10/);
  assert.deepEqual(checkout.shippingSnapshot.estimatedDelivery, selection.estimate);
});

test("shipping-enabled membership checkout rejects forged, expired, or replay-changed selection", async () => {
  const shippingAddress = {
    recipient: "Ana Popescu",
    countryCode: "RO",
    subdivisionCode: "CJ",
    locality: "Cluj-Napoca",
    postalCode: "400001",
    street: "Strada Memorandumului",
    building: "10",
  };
  const quoteSecret = "membership-shipping-secret-at-least-32-bytes";
  const selection = quoteShipping({
    address: shippingAddress,
    items: reserve.items,
    products: [product],
  }, { secret: quoteSecret, now: reserve.now })[0];
  const make = () => fixture({
    env: {
      SHIPPING_ENABLED: "true",
      SHIPPING_QUOTE_SECRET: quoteSecret,
    },
  }).service;
  await assert.rejects(make().reserve({
    ...reserve,
    shippingSelection: { ...selection, amountMinor: 1 },
    shippingSnapshot: { shippingAddress },
  }), /shipping quote is invalid/i);
  await assert.rejects(make().reserve({
    ...reserve,
    now: new Date(selection.expiresAt),
    shippingSelection: selection,
    shippingSnapshot: { shippingAddress },
  }), /shipping quote expired/i);

  const service = make();
  await service.reserve({
    ...reserve,
    shippingSelection: selection,
    shippingSnapshot: { shippingAddress },
  });
  await assert.rejects(service.reserve({
    ...reserve,
    shippingSelection: { ...selection, service: "express" },
    shippingSnapshot: { shippingAddress },
  }), /idempotency conflict|shipping quote is invalid/i);
});

test("persists authoritative customer, membership, stock, credit, and totals binding", async () => {
  const { adapter, service } = fixture();
  const result = await service.reserve(reserve);
  assert.deepEqual(result.totals, {
    merchandiseMinor: 0, coveredMerchandiseMinor: 6000,
    creditsRequired: 2, shippingMinor: 495, totalMinor: 495,
  });
  assert.equal(result.currency, "EUR");
  assert.equal(adapter.checkouts.get(reserve.checkoutReference).customerDocumentId, "customer-1");
  assert.equal(adapter.stock.get("product-1"), 0);
  assert.equal(adapter.creditReservations.get(reserve.checkoutReference).credits, 2);
  assert.equal(
    adapter.checkouts.get(reserve.checkoutReference).expiresAt,
    "2026-07-24T00:10:00.000Z",
  );
});

test("prepares one pending order from authoritative checkout bindings", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  const input = {
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "order-1",
    now: new Date("2026-07-24T00:05:00.000Z"),
    orderMetadata: {
      email: "customer@example.com",
      customerName: "Customer",
      shippingAddressText: "Authoritative address",
      shippingAddress: { city: "Cluj" },
    },
  };
  const first = await service.preparePendingOrder(input);
  const replay = await service.preparePendingOrder({
    ...input,
    orderMetadata: { email: "forged@example.com" },
  });
  assert.equal(first.order.status, "pending");
  assert.equal(replay.idempotent, true);
  assert.equal(replay.order.documentId, first.order.documentId);
  assert.equal(first.order.customerDocumentId, checkout.customerDocumentId);
  assert.equal(first.order.membershipDocumentId, checkout.membershipDocumentId);
  assert.equal(first.order.checkoutReference, checkout.checkoutReference);
  assert.equal(first.order.totalCents, checkout.totals.totalMinor);
  assert.deepEqual(first.order.items, checkout.items);
  assert.equal(
    adapter.checkouts.get(checkout.checkoutReference).orderDocumentId,
    first.order.documentId,
  );
  assert.equal(adapter.creditReservations.get(checkout.checkoutReference).status, "reserved");
});

test("feature-off pending order replay accepts a pre-shipping order without a copied snapshot", async () => {
  const { service } = fixture();
  const checkout = await service.reserve({
    ...reserve,
    shippingSnapshot: {
      shippingAddressText: "Legacy address",
      shippingAddress: { city: "Cluj" },
    },
  });
  const input = {
    customerDocumentId: checkout.customerDocumentId,
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "legacy-order",
    now: new Date("2026-07-24T00:05:00.000Z"),
  };
  const first = await service.preparePendingOrder(input);
  delete first.order.shippingSnapshot;

  const replay = await service.preparePendingOrder(input);

  assert.equal(replay.idempotent, true);
  assert.equal(replay.order.documentId, first.order.documentId);
});

test("pending order preparation rejects cross-customer and expired checkouts", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  await assert.rejects(service.preparePendingOrder({
    customerDocumentId: "customer-2",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "order-1",
  }), /not found/i);
  await assert.rejects(service.preparePendingOrder({
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "order-1",
    now: new Date("2026-07-24T00:11:00.000Z"),
  }), /expired/i);
  assert.equal(adapter.orders.size, 0);
  assert.equal(adapter.stock.get("product-1"), 2);
});

test("pending order replay rejects changed immutable items and totals", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  const input = {
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "order-1",
    now: new Date("2026-07-24T00:05:00.000Z"),
  };
  const { order } = await service.preparePendingOrder(input);
  order.items[0].qty = 1;
  await assert.rejects(service.preparePendingOrder(input), /binding/i);
});

test("authenticated manual release is idempotent and restores stock and credit once", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  const input = {
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "release-1",
  };
  const first = await service.release(input);
  const retry = await service.release(input);
  assert.equal(first.status, "released");
  assert.equal(retry.idempotent, true);
  assert.equal(adapter.stock.get("product-1"), 2);
  assert.equal(adapter.creditReservations.get(checkout.checkoutReference).status, "released");
  await assert.rejects(() => service.release({
    ...input, customerDocumentId: "customer-2",
  }), /not found/i);
});

test("bounded expiry sweep releases abandoned reservations exactly once", async () => {
  const { adapter, service } = fixture();
  await service.reserve(reserve);
  const expired = await service.expireDue(new Date("2026-07-24T00:11:00.000Z"), 1);
  assert.equal(expired, 1);
  assert.equal(await service.expireDue(new Date("2026-07-24T00:12:00.000Z"), 1), 0);
  assert.equal(adapter.stock.get("product-1"), 2);
  assert.equal(adapter.checkouts.get(reserve.checkoutReference).status, "expired");
});

test("finalize after expiry compensates and cannot create a paid order", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  await assert.rejects(() => service.finalize({
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "final-1",
    now: new Date("2026-07-24T00:11:00.000Z"),
  }), /expired/i);
  assert.equal(adapter.orders.size, 0);
  assert.equal(adapter.stock.get("product-1"), 2);
  assert.equal(adapter.checkouts.get(checkout.checkoutReference).status, "expired");
});

test("finalize revalidates membership and releases a now-expired membership checkout", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  adapter.memberships.get("membership-1").status = "expired";
  await assert.rejects(() => service.finalize({
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "final-1",
    now: new Date("2026-07-24T00:05:00.000Z"),
  }), /membership/i);
  assert.equal(adapter.orders.size, 0);
  assert.equal(adapter.stock.get("product-1"), 2);
  assert.equal(adapter.checkouts.get(checkout.checkoutReference).status, "released");
});

test("finalize and release race serializes to one terminal outcome without double stock", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  const results = await Promise.allSettled([
    service.finalize({
      customerDocumentId: "customer-1",
      checkoutReference: checkout.checkoutReference,
      idempotencyKey: "final-1",
      now: new Date("2026-07-24T00:05:00.000Z"),
    }),
    service.release({
      customerDocumentId: "customer-1",
      checkoutReference: checkout.checkoutReference,
      idempotencyKey: "release-1",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const status = adapter.checkouts.get(checkout.checkoutReference).status;
  assert.ok(status === "paid" || status === "released");
  assert.equal(adapter.stock.get("product-1"), status === "paid" ? 0 : 2);
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
    now: new Date("2026-07-24T00:05:00.000Z"),
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
    now: new Date("2026-07-24T00:05:00.000Z"),
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

test("paid checkout replay requires the exact order, payment, and settlement key", async () => {
  const { adapter, service } = fixture();
  const checkout = await service.reserve(reserve);
  adapter.orders.set("order-1", {
    documentId: "order-1",
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    paymentDocumentId: "payment-1",
    status: "paid",
  });
  const exact = {
    customerDocumentId: "customer-1",
    checkoutReference: checkout.checkoutReference,
    orderDocumentId: "order-1",
    paymentDocumentId: "payment-1",
    idempotencyKey: "payment:payment-1:settle",
    now: new Date("2026-07-24T00:05:00.000Z"),
  };
  await service.finalize(exact);
  assert.equal((await service.finalize(exact)).idempotent, true);
  for (const changed of [
    { orderDocumentId: "order-2" },
    { paymentDocumentId: "payment-2" },
    { idempotencyKey: "payment:payment-2:settle" },
  ]) {
    await assert.rejects(
      service.finalize({ ...exact, ...changed }),
      /binding|idempotency conflict/i,
    );
  }
  assert.equal(adapter.checkouts.get(checkout.checkoutReference).orderDocumentId, "order-1");
  assert.equal(adapter.checkouts.get(checkout.checkoutReference).settlementKey, exact.idempotencyKey);
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
    now: new Date("2026-07-24T00:05:00.000Z"),
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
    now: new Date("2026-07-24T00:05:00.000Z"),
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
