import test from "node:test";
import assert from "node:assert/strict";

import { buildInventoryProjection, getInventoryHealth } from "./inventory-projection.cjs";

test("separates allocated customer stock from incoming supplier stock", () => {
  const products = [
    { documentId: "product-1", slug: "kencur", sku: "JM-KENCUR", stock: 7 },
    { documentId: "product-2", slug: "jahe", sku: "JM-JAHE", stock: 4 },
  ];
  const orders = [
    { status: "paid", items: [{ productId: "product-1", slug: "kencur", qty: 2 }] },
    { status: "processing", items: [{ sku: "JM-KENCUR", qty: 1 }] },
    { status: "pending", items: [{ productId: "product-1", qty: 8 }] },
    { status: "shipped", items: [{ productId: "product-1", qty: 5 }] },
  ];
  const purchaseOrders = [
    { status: "ordered", items: [{ productDocumentId: "product-1", quantity: 5 }] },
    { status: "in_transit", items: [{ productDocumentId: "product-1", quantity: 4 }] },
    { status: "partially_received", items: [{ productDocumentId: "product-1", quantity: 10, receivedQuantity: 6 }] },
    { status: "draft", items: [{ productDocumentId: "product-1", quantity: 20 }] },
    { status: "received", items: [{ productDocumentId: "product-2", quantity: 12 }] },
  ];

  const result = buildInventoryProjection(products, orders, purchaseOrders);

  assert.deepEqual(result.rows[0], {
    productDocumentId: "product-1",
    available: 7,
    allocated: 3,
    onHand: 10,
    incoming: 13,
    projected: 20,
  });
  assert.deepEqual(result.rows[1], {
    productDocumentId: "product-2",
    available: 4,
    allocated: 0,
    onHand: 4,
    incoming: 0,
    projected: 4,
  });
  assert.deepEqual(result.totals, {
    available: 11,
    allocated: 3,
    onHand: 14,
    incoming: 13,
    projected: 24,
  });
});

test("ignores invalid quantities and never exposes negative available stock", () => {
  const result = buildInventoryProjection(
    [{ documentId: "product-1", slug: "kencur", stock: -3 }],
    [{ status: "paid", items: [{ productId: "product-1", qty: -2 }] }],
    [{ status: "ordered", items: [{ productDocumentId: "product-1", quantity: "bad" }] }],
  );

  assert.deepEqual(result.rows[0], {
    productDocumentId: "product-1",
    available: 0,
    allocated: 0,
    onHand: 0,
    incoming: 0,
    projected: 0,
  });
});

test("reports restocking when incoming units recover a low-stock product", () => {
  assert.equal(getInventoryHealth({ available: 2, incoming: 10, projected: 12, minStock: 5, maxStock: 30 }), "Restocking");
  assert.equal(getInventoryHealth({ available: 0, incoming: 0, projected: 0, minStock: 5, maxStock: 30 }), "Out");
  assert.equal(getInventoryHealth({ available: 3, incoming: 0, projected: 3, minStock: 5, maxStock: 30 }), "Low");
  assert.equal(getInventoryHealth({ available: 20, incoming: 20, projected: 40, minStock: 5, maxStock: 30 }), "Over max");
  assert.equal(getInventoryHealth({ available: 20, incoming: 0, projected: 20, minStock: 5, maxStock: 30 }), "Healthy");
});
