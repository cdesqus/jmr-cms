import test from "node:test";
import assert from "node:assert/strict";

import {
  createCartonPayload,
  isPurchaseOrderReceivable,
  parseCartonPayload,
  purchaseOrderOutstanding,
} from "./receiving.cjs";

test("creates a unique carton payload that round-trips its receiving identity", () => {
  const first = createCartonPayload({
    poNumber: "PO-2026-001",
    productDocumentId: "product-1",
    batchNumber: "BATCH-001",
    carton: 1,
    quantity: 24,
  });
  const second = createCartonPayload({
    poNumber: "PO-2026-001",
    productDocumentId: "product-1",
    batchNumber: "BATCH-001",
    carton: 2,
    quantity: 24,
  });

  assert.notEqual(first, second);
  assert.deepEqual(parseCartonPayload(first), {
    version: 1,
    poNumber: "PO-2026-001",
    productDocumentId: "product-1",
    batchNumber: "BATCH-001",
    carton: 1,
    quantity: 24,
    cartonId: "PO-2026-001:product-1:BATCH-001:1",
  });
});

test("rejects malformed or unsafe carton payloads", () => {
  assert.equal(parseCartonPayload("BATCH-001"), null);
  assert.equal(parseCartonPayload("JMR1:not-base64"), null);
  assert.equal(createCartonPayload({ poNumber: "", productDocumentId: "p1", batchNumber: "B1", carton: 1, quantity: 1 }), "");
});

test("makes ordered purchase orders receivable without an in-transit step", () => {
  const ordered = { status: "ordered", items: [{ quantity: 100, receivedQuantity: 20 }] };
  const partial = { status: "partially_received", items: [{ quantity: 50, receivedQuantity: 25 }] };

  assert.equal(purchaseOrderOutstanding(ordered), 80);
  assert.equal(isPurchaseOrderReceivable(ordered), true);
  assert.equal(isPurchaseOrderReceivable(partial), true);
  assert.equal(isPurchaseOrderReceivable({ ...ordered, status: "draft" }), false);
  assert.equal(isPurchaseOrderReceivable({ ...ordered, status: "received" }), false);
  assert.equal(isPurchaseOrderReceivable({ status: "ordered", items: [{ quantity: 10, receivedQuantity: 10 }] }), false);
});
