import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateLegacyReservations,
  createMemoryStockReservationAdapter,
  createStockReservationService,
  createStrapiStockReservationAdapter,
} from "./stock-reservation-transaction.cjs";
import { readFile } from "node:fs/promises";

const NOW = new Date("2026-07-29T08:00:00.000Z");
const product = {
  documentId: "product-1",
  slug: "beras-kencur",
  sku: "BK-001",
  name: "Beras Kencur",
  stock: 1,
};
const batch = {
  documentId: "batch-1",
  productDocumentId: product.documentId,
  slug: product.slug,
  sku: product.sku,
  batchNumber: "BK-2607",
  quantity: 1,
  reservedQuantity: 0,
  status: "active",
  expiryDate: "2027-07-01",
};

function input(overrides = {}) {
  return {
    idempotencyKey: "f8c54087-2e2c-45b3-a5dc-e32b441cf465",
    items: [{ slug: product.slug, qty: 1 }],
    email: "guest@example.test",
    now: NOW,
    ...overrides,
  };
}

function fixture(options = {}) {
  const adapter = createMemoryStockReservationAdapter({
    products: [product],
    batches: [batch],
    ...options,
  });
  return {
    adapter,
    service: createStockReservationService(adapter),
  };
}

test("concurrent ordinary reservations cannot oversell the same batch", async () => {
  const { adapter, service } = fixture();
  const settled = await Promise.allSettled([
    service.reserve(input()),
    service.reserve(input({
      idempotencyKey: "3a0ce871-10f0-40ac-bd1b-66a9e0ea535d",
      email: "other@example.test",
    })),
  ]);

  assert.equal(settled.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(settled.filter((entry) => entry.status === "rejected").length, 1);
  assert.equal(adapter.state.batches.get(batch.documentId).reservedQuantity, 1);
  assert.equal(adapter.state.reservations.size, 1);
});

test("response-loss retry returns the same bearer without reserving twice", async () => {
  const { adapter, service } = fixture();
  const first = await service.reserve(input());
  const replay = await service.reserve(input());

  assert.equal(replay.token, first.token);
  assert.equal(replay.documentId, first.documentId);
  assert.equal(replay.idempotent, true);
  assert.equal(adapter.state.batches.get(batch.documentId).reservedQuantity, 1);
  assert.equal(adapter.state.reservations.size, 1);
});

test("an idempotency key cannot be reused with a changed request", async () => {
  const { service } = fixture();
  await service.reserve(input());

  await assert.rejects(
    service.reserve(input({ email: "changed@example.test" })),
    /idempotency conflict/i,
  );
});

test("concurrent expiry releases an exact reservation only once", async () => {
  const { adapter, service } = fixture();
  const reservation = await service.reserve(input());
  const afterExpiry = new Date(reservation.expiresAt);
  afterExpiry.setMilliseconds(afterExpiry.getMilliseconds() + 1);

  const results = await Promise.all([
    service.expireOne(reservation.documentId, afterExpiry),
    service.expireOne(reservation.documentId, afterExpiry),
  ]);

  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(adapter.state.batches.get(batch.documentId).reservedQuantity, 0);
  assert.equal(
    adapter.state.reservations.get(reservation.documentId).status,
    "expired",
  );
});

test("transaction failure rolls back batch counters and bearer creation", async () => {
  const { adapter, service } = fixture({ failCreate: true });

  await assert.rejects(service.reserve(input()), /simulated create failure/i);
  assert.equal(adapter.state.batches.get(batch.documentId).reservedQuantity, 0);
  assert.equal(adapter.state.reservations.size, 0);
});

test("expiry refuses corrupt counters instead of hiding them with a clamp", async () => {
  const { adapter, service } = fixture();
  const reservation = await service.reserve(input());
  adapter.state.batches.get(batch.documentId).reservedQuantity = 0;
  const afterExpiry = new Date(reservation.expiresAt);
  afterExpiry.setMilliseconds(afterExpiry.getMilliseconds() + 1);

  await assert.rejects(
    service.expireOne(reservation.documentId, afterExpiry),
    /reserved quantity is invalid/i,
  );
  assert.equal(
    adapter.state.reservations.get(reservation.documentId).status,
    "reserved",
  );
});

test("legacy-stock accounting fails closed when its bounded scan is exhausted", () => {
  const reservations = Array.from({ length: 1_001 }, (_, index) => ({
    allocations: [{
      slug: product.slug,
      batchDocumentId: null,
      qty: 1,
      sequence: index,
    }],
  }));
  assert.throws(
    () => aggregateLegacyReservations(
      reservations,
      [product.slug],
      1_000,
    ),
    /not bounded/i,
  );
});

test("idempotency fields remain nullable for existing reservation rows", async () => {
  const schema = JSON.parse(await readFile(new URL(
    "../../stock-reservation/content-types/stock-reservation/schema.json",
    import.meta.url,
  ), "utf8"));
  assert.notEqual(schema.attributes.idempotencyKey.required, true);
  assert.notEqual(schema.attributes.requestBinding.required, true);
  assert.equal(schema.attributes.idempotencyKey.unique, true);
});

test("PostgreSQL ordinary reservations lock batches before products in stable order", async () => {
  const locks = [];
  const queryCalls = [];
  const products = [
    { ...product, documentId: "product-b", slug: "b", publishedAt: NOW },
    { ...product, documentId: "product-a", slug: "a", publishedAt: NOW },
  ];
  const batches = [
    { ...batch, documentId: "batch-b", slug: "b" },
    { ...batch, documentId: "batch-a", slug: "a" },
  ];
  const strapi = {
    db: {
      query(uid) {
        return {
          async findMany(input) {
            queryCalls.push([uid, structuredClone(input)]);
            if (uid === "api::product.product") {
              return structuredClone(products);
            }
            if (uid === "api::inventory-batch.inventory-batch") {
              return structuredClone(batches);
            }
            return [];
          },
        };
      },
      connection(table) {
        const chain = {
          where(value) {
            locks.push([table, value.document_id]);
            return chain;
          },
          transacting() {
            return chain;
          },
          forUpdate() {
            return chain;
          },
          async first() {},
        };
        return chain;
      },
      async transaction(work) {
        return work({ trx: { id: "trx-1" } });
      },
    },
  };
  const adapter = createStrapiStockReservationAdapter(strapi);

  await adapter.transaction((tx) => tx.lockInventory(["b", "a"], NOW));

  assert.deepEqual(locks, [
    ["inventory_batches", "batch-a"],
    ["inventory_batches", "batch-b"],
    ["products", "product-a"],
    ["products", "product-b"],
  ]);
  const activeReservations = queryCalls.find(([uid]) =>
    uid === "api::stock-reservation.stock-reservation");
  assert.equal(activeReservations[1].limit, 1_001);
});
