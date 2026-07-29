import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryMembershipCheckoutAdapter,
  createMembershipCheckoutService,
  createStrapiMembershipCheckoutAdapter,
} from "./membership-checkout.cjs";
import { quoteShipping } from "../../shipping-operations/services/shipping-domain.cjs";
import {
  createMemoryShipmentAdapter,
  createMockShippingProvider,
  createShipmentTransactions,
} from "../../shipping-operations/services/shipment-transaction.cjs";
import {
  claimCustomerTrackingCapability,
  createMemoryTrackingCapabilityAdapter,
} from "../../shipping-operations/services/tracking-capability-reissue.cjs";
import {
  createPublicOrderTrackingQuery,
} from "../../analytics/services/public-order-tracking.cjs";

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
  sku: "BK-001", name: "Beras Kencur",
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

test("Strapi membership shipping locks one explicit published product row and re-reads it", async () => {
  const queries = [];
  const locks = [];
  const publishedProduct = {
    ...product,
    id: 101,
    publishedAt: "2026-07-24T10:00:00.000Z",
  };
  const trx = { id: "membership-transaction" };
  const strapi = {
    contentTypes: {
      "api::product.product": { pluginOptions: {} },
    },
    db: {
      query(uid) {
        if (uid === "api::product.product") {
          return {
            findOne: async (query) => {
              queries.push(["findOne", query]);
              return publishedProduct;
            },
            findMany: async (query) => {
              queries.push(["findMany", query]);
              return [publishedProduct];
            },
          };
        }
        return {};
      },
      connection(table) {
        assert.equal(table, "products");
        const chain = {
          where(value) {
            locks.push(["where", value]);
            return chain;
          },
          transacting(value) {
            locks.push(["transacting", value]);
            return chain;
          },
          forUpdate() {
            locks.push(["forUpdate"]);
            return chain;
          },
          first: async () => {
            locks.push(["first"]);
          },
          andWhere(...values) {
            locks.push(["andWhere", ...values]);
            return chain;
          },
          decrement: async (...values) => {
            locks.push(["decrement", ...values]);
            return 1;
          },
          increment: async (...values) => {
            locks.push(["increment", ...values]);
            return 1;
          },
        };
        return chain;
      },
      transaction: async (work) => work({ trx }),
    },
  };
  const adapter = createStrapiMembershipCheckoutAdapter(strapi);

  assert.equal(await adapter.transaction(async (tx) => {
    const locked = await tx.lockProductBySlug(product.slug);
    await tx.reserveStock({
      rowId: locked.id,
      documentId: locked.documentId,
    }, 1);
    await tx.releaseStock([{
      productRowId: locked.id,
      productDocumentId: locked.documentId,
      qty: 1,
    }]);
    await tx.releaseStock([{
      productDocumentId: locked.documentId,
      qty: 1,
    }]);
    return locked;
  }), publishedProduct);
  assert.deepEqual(queries, [
    ["findMany", {
      where: {
        slug: product.slug,
        publishedAt: { $notNull: true },
      },
      transacting: trx,
    }],
    ["findOne", {
      where: {
        id: 101,
        publishedAt: { $notNull: true },
      },
      transacting: trx,
    }],
  ]);
  assert.deepEqual(locks, [
    ["where", { id: 101 }],
    ["transacting", trx],
    ["forUpdate"],
    ["first"],
    ["where", { id: 101 }],
    ["andWhere", "stock", ">=", 1],
    ["transacting", trx],
    ["decrement", "stock", 1],
    ["where", { id: 101 }],
    ["transacting", trx],
    ["increment", "stock", 1],
    ["where", { document_id: "product-1" }],
    ["transacting", trx],
    ["increment", "stock", 1],
  ]);
});

test("multi-product membership reservations acquire product locks in stable slug order", async () => {
  const products = [
    {
      ...product,
      documentId: "product-z",
      slug: "z-product",
      stock: 1,
    },
    {
      ...product,
      documentId: "product-a",
      slug: "a-product",
      stock: 1,
    },
  ];
  const adapter = createMemoryMembershipCheckoutAdapter({
    memberships: [{
      ...membership,
      ledgerBalance: 10,
      eligibleProductSlugs: products.map(({ slug }) => slug),
    }],
    products,
  });
  const transaction = adapter.transaction.bind(adapter);
  const locks = [];
  adapter.transaction = (work) => transaction((tx) => work({
    ...tx,
    async lockProductBySlug(slug) {
      locks.push(slug);
      return tx.lockProductBySlug(slug);
    },
  }));
  const service = createMembershipCheckoutService(adapter, {
    MEMBERSHIP_ENABLED: "true",
  });

  await service.reserve({
    ...reserve,
    items: [
      { slug: "z-product", qty: 1 },
      { slug: "a-product", qty: 1 },
    ],
  });

  assert.deepEqual(locks, ["a-product", "z-product"]);
});

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
  assert.equal(
    new Date(checkout.expiresAt) >= new Date(selection.expiresAt),
    true,
  );
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

test("member reservation persists FEFO batches, a packable checklist, and pending tracking delivery", async () => {
  const batch = {
    documentId: "batch-1",
    productDocumentId: product.documentId,
    slug: product.slug,
    sku: product.sku,
    batchNumber: "LOT-2026-01",
    quantity: 2,
    reservedQuantity: 0,
    expiryDate: "2027-01-01",
    status: "active",
  };
  const { adapter, service } = fixture({ batches: [batch] });

  const checkout = await service.reserve(reserve);
  assert.deepEqual(checkout.batchAllocations, [{
    productDocumentId: product.documentId,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    batchDocumentId: batch.documentId,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate,
    qty: 2,
  }]);
  assert.equal(adapter.batches.get(batch.documentId).reservedQuantity, 2);

  const prepared = await service.preparePendingOrder({
    customerDocumentId: reserve.customerDocumentId,
    checkoutReference: reserve.checkoutReference,
    idempotencyKey: "member-pending-order",
    now: new Date("2026-07-24T00:05:00.000Z"),
    orderMetadata: { email: "customer@example.com" },
  });
  assert.deepEqual(
    prepared.order.batchAllocations,
    checkout.batchAllocations,
  );
  assert.deepEqual(prepared.order.fulfilmentChecklist, [{
    productId: product.documentId,
    sku: product.sku,
    name: product.name,
    batchDocumentId: batch.documentId,
    batchNumber: batch.batchNumber,
    qty: 2,
    scannedQty: 0,
    checked: false,
  }]);
  assert.equal(
    prepared.order.trackingCapabilityStatus,
    "pending_delivery",
  );
  assert.equal(prepared.order.trackingCapabilityVersion, 0);
  assert.equal(JSON.stringify(prepared.order).includes("trk_"), false);
});

test("membership reservation never relabels unavailable batch stock as legacy stock", async () => {
  const { service } = fixture({
    batches: [{
      documentId: "expired-batch-1",
      productDocumentId: product.documentId,
      slug: product.slug,
      sku: product.sku,
      batchNumber: "EXPIRED-1",
      quantity: 2,
      reservedQuantity: 0,
      status: "active",
      expiryDate: "2026-06-01",
    }],
  });

  await assert.rejects(
    service.reserve(reserve),
    /insufficient batch stock/i,
  );
});

test("real member checkout becomes packable, shippable, claimable, and publicly trackable", async () => {
  const batch = {
    documentId: "batch-1",
    productDocumentId: product.documentId,
    slug: product.slug,
    sku: product.sku,
    batchNumber: "LOT-2026-01",
    quantity: 2,
    reservedQuantity: 0,
    expiryDate: "2027-01-01",
    status: "active",
  };
  const shippingAddress = {
    recipient: "Member Customer",
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
  const { adapter, service } = fixture({
    batches: [batch],
    env: {
      SHIPPING_ENABLED: "true",
      SHIPPING_QUOTE_SECRET: quoteSecret,
    },
  });
  const checkout = await service.reserve({
    ...reserve,
    shippingSelection: selection,
    shippingSnapshot: {
      customerName: "Member Customer",
      email: "member@example.com",
      shippingAddress,
    },
  });
  const prepared = await service.preparePendingOrder({
    customerDocumentId: reserve.customerDocumentId,
    checkoutReference: reserve.checkoutReference,
    idempotencyKey: "member-pending-order",
    now: new Date("2026-07-24T00:05:00.000Z"),
  });
  Object.assign(adapter.orders.get(prepared.order.documentId), {
    status: "paid",
    paymentDocumentId: "payment-member",
  });
  const finalized = await service.finalize({
    customerDocumentId: reserve.customerDocumentId,
    checkoutReference: reserve.checkoutReference,
    orderDocumentId: prepared.order.documentId,
    paymentDocumentId: "payment-member",
    idempotencyKey: "payment:member:settle",
    now: new Date("2026-07-24T00:06:00.000Z"),
  });
  const packedOrder = {
    ...structuredClone(finalized.order),
    status: "processing",
    packedAt: "2026-07-24T00:07:00.000Z",
    packedBy: "warehouse@example.com",
    fulfilmentChecklist: finalized.order.fulfilmentChecklist.map((line) => ({
      ...line,
      scannedQty: line.qty,
      checked: true,
    })),
  };
  const shipmentAdapter = createMemoryShipmentAdapter({
    orders: [packedOrder],
    payments: [{
      documentId: "payment-member",
      status: "paid",
      subjectType: "order",
      orderDocumentId: packedOrder.documentId,
      amountMinor: packedOrder.priceSnapshot.charge.amountMinor,
      currency: packedOrder.priceSnapshot.charge.currency,
    }],
    products: [{
      ...product,
      publishedAt: "2026-07-01T00:00:00.000Z",
    }],
    batches: [adapter.batches.get(batch.documentId)],
  });
  const shipmentTransactions = createShipmentTransactions({
    adapter: shipmentAdapter,
    provider: createMockShippingProvider(),
    capabilitySecret: "member-label-capability-secret-at-least-32-bytes",
  });
  const created = await shipmentTransactions.createShipment({
    orderDocumentId: packedOrder.documentId,
    actor: "warehouse@example.com",
    now: new Date("2026-07-24T00:08:00.000Z"),
  });
  assert.match(created.shipment.awb, /^JMR\d{18}$/);

  const capabilityAdapter = createMemoryTrackingCapabilityAdapter({
    orders: [packedOrder],
    customers: [{
      documentId: reserve.customerDocumentId,
      email: "member@example.com",
      active: true,
      emailVerifiedAt: "2026-07-01T00:00:00.000Z",
    }],
  });
  const claim = await claimCustomerTrackingCapability({
    adapter: capabilityAdapter,
    customerDocumentId: reserve.customerDocumentId,
    orderDocumentId: packedOrder.documentId,
    storefrontUrl: "https://shop.example.test",
    randomBytes: () => Buffer.alloc(32, 9),
    now: new Date("2026-07-24T00:09:00.000Z"),
  });
  const access = new URL(claim.trackingUrl).searchParams.get("access");
  const storedOrder = capabilityAdapter.orders.get(packedOrder.documentId);
  const trackingQuery = createPublicOrderTrackingQuery({
    documents: (uid) => ({
      async findMany() {
        if (uid === "api::order.order") return [storedOrder];
        if (uid === "api::shipment.shipment") {
          return [...shipmentAdapter.shipments.values()];
        }
        if (uid === "api::shipment-event.shipment-event") return [];
        return [];
      },
    }),
  });
  const publicOrder = await trackingQuery(storedOrder.orderNumber, access);
  assert.equal(publicOrder.shipment.trackingNumber, created.shipment.awb);
  assert.equal(JSON.stringify(storedOrder).includes("trk_"), false);
  assert.equal(JSON.stringify(capabilityAdapter.audits).includes("trk_"), false);
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

test("finalize acquires membership before reserved inventory to match reservation lock order", async () => {
  const { adapter, service } = fixture({
    batches: [{
      documentId: "batch-1",
      productDocumentId: product.documentId,
      slug: product.slug,
      sku: product.sku,
      batchNumber: "LOT-2026-01",
      quantity: 2,
      reservedQuantity: 0,
      expiryDate: "2027-01-01",
      status: "active",
    }],
  });
  const transaction = adapter.transaction.bind(adapter);
  const locks = [];
  adapter.transaction = (work) => transaction((tx) => work({
    ...tx,
    async lockMembership(id) {
      locks.push(`membership:${id}`);
      return tx.lockMembership(id);
    },
    async lockReservedInventory(allocations) {
      locks.push(`inventory:${allocations.map((item) => item.batchDocumentId).join(",")}`);
      return tx.lockReservedInventory(allocations);
    },
  }));

  const checkout = await service.reserve(reserve);
  locks.length = 0;
  await service.finalize({
    customerDocumentId: reserve.customerDocumentId,
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: "final-1",
    now: new Date("2026-07-24T00:05:00.000Z"),
  });

  assert.deepEqual(locks.slice(0, 2), [
    "membership:membership-1",
    "inventory:batch-1",
  ]);
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

test("unique-conflict recovery rejects a winner with a changed shipping quote or address snapshot", async () => {
  const shippingSelection = {
    quoteId: `shq_${"D".repeat(43)}`,
    carrier: "jamora-mock",
    service: "standard",
    amountMinor: 2090,
    currency: "RON",
    estimate: { minimumDays: 2, maximumDays: 3 },
    quotedAt: "2026-07-25T10:00:00.000Z",
    expiresAt: "2026-07-25T10:15:00.000Z",
  };
  const shippingAddress = {
    recipient: "Ana Popescu",
    countryCode: "RO",
    subdivisionCode: "CJ",
    locality: "Cluj-Napoca",
    postalCode: "400001",
    street: "Strada Memorandumului",
    building: "10",
  };
  const winner = {
    checkoutReference: reserve.checkoutReference,
    idempotencyKey: reserve.idempotencyKey,
    customerDocumentId: reserve.customerDocumentId,
    membershipDocumentId: reserve.membershipDocumentId,
    shippingSnapshot: {
      quote: {
        ...shippingSelection,
        addressDigest: "opaque",
        itemsDigest: "opaque",
      },
      shippingAddress: { ...shippingAddress, building: "99" },
    },
  };
  const service = createMembershipCheckoutService({
    transaction: async () => {
      throw new Error("unique checkout conflict");
    },
    findCheckout: async () => winner,
  }, {
    MEMBERSHIP_ENABLED: "true",
    SHIPPING_ENABLED: "true",
    SHIPPING_QUOTE_SECRET: "membership-shipping-secret-at-least-32-bytes",
  });

  await assert.rejects(
    service.reserve({
      ...reserve,
      shippingSelection,
      shippingSnapshot: { shippingAddress },
    }),
    /checkout idempotency conflict/i,
  );
});
