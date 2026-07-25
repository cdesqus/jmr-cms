import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFulfilmentChecklist,
  findPackingScanIndex,
  isPackingComplete,
} from "./packing";
import type { AdminOrder, AdminProduct } from "./admin-api";

const order = {
  documentId: "order-1",
  status: "processing",
  items: [{
    productId: "product-1",
    slug: "jamu-one",
    sku: "JAMU-1",
    name: "Jamu One",
    qty: 3,
    unitPriceCents: 100,
    lineTotalCents: 300,
  }],
  batchAllocations: [
    {
      productDocumentId: "product-1",
      slug: "jamu-one",
      sku: "JAMU-1",
      name: "Jamu One",
      batchDocumentId: "batch-1",
      batchNumber: "LOT-1",
      qty: 1,
    },
    {
      productDocumentId: "product-1",
      slug: "jamu-one",
      sku: "JAMU-1",
      name: "Jamu One",
      batchDocumentId: "batch-2",
      batchNumber: "LOT-2",
      qty: 2,
    },
  ],
  fulfilmentChecklist: [{
    productId: "product-wholesale",
    sku: "WHOLESALE",
    name: "Spoof",
    batchDocumentId: "batch-wholesale",
    batchNumber: "WHOLESALE-LOT",
    qty: 100,
    scannedQty: 100,
    checked: true,
  }],
} satisfies AdminOrder;

const products = [{
  documentId: "product-1",
  slug: "jamu-one",
  sku: "JAMU-1",
  name: "Jamu One",
  category: "energy",
  priceCents: 100,
}] satisfies AdminProduct[];

test("packing UI derives one exact row per authoritative batch allocation", () => {
  const checklist = buildFulfilmentChecklist(order, products);
  assert.deepEqual(checklist, [
    {
      productId: "product-1",
      sku: "JAMU-1",
      name: "Jamu One",
      batchDocumentId: "batch-1",
      batchNumber: "LOT-1",
      qty: 1,
      scannedQty: 0,
      checked: false,
    },
    {
      productId: "product-1",
      sku: "JAMU-1",
      name: "Jamu One",
      batchDocumentId: "batch-2",
      batchNumber: "LOT-2",
      qty: 2,
      scannedQty: 0,
      checked: false,
    },
  ]);
  assert.equal(findPackingScanIndex(order, checklist, "LOT-2"), 1);
  assert.equal(findPackingScanIndex(order, [
    { ...checklist[0], scannedQty: 1, checked: true },
    checklist[1],
  ], "JAMU-1"), 1);
});

test("packing completeness requires exact scanned quantities", () => {
  const checklist = buildFulfilmentChecklist({
    ...order,
    fulfilmentChecklist: order.batchAllocations.map((allocation) => ({
      productId: allocation.productDocumentId,
      sku: allocation.sku,
      name: allocation.name,
      batchDocumentId: allocation.batchDocumentId,
      batchNumber: allocation.batchNumber,
      qty: allocation.qty,
      scannedQty: allocation.qty,
      checked: true,
    })),
  }, products);
  assert.equal(isPackingComplete(checklist, "Warehouse One"), true);
  assert.equal(isPackingComplete([
    { ...checklist[0], scannedQty: 2 },
    checklist[1],
  ], "Warehouse One"), false);
});
