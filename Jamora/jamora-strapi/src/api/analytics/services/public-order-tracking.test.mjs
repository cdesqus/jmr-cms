import assert from "node:assert/strict";
import test from "node:test";

import { createPublicOrderTrackingQuery } from "./public-order-tracking.cjs";

function documentsFixture({ order, shipment, events = [] }) {
  return (uid) => {
    if (uid === "api::order.order") {
      return { findMany: async () => order ? [structuredClone(order)] : [] };
    }
    if (uid === "api::shipment.shipment") {
      return {
        findMany: async () => shipment ? [structuredClone(shipment)] : [],
      };
    }
    if (uid === "api::shipment-event.shipment-event") {
      return { findMany: async () => structuredClone(events) };
    }
    throw new Error(`Unexpected content type ${uid}`);
  };
}

test("public order tracking prefers safe shipment projection and omits private legacy label URLs", async () => {
  const order = {
    documentId: "order-1",
    orderNumber: "JMR-1001",
    trackingNumber: "JMR000000000000000001",
    carrier: "jamora-mock",
    customerName: "Ana",
    email: "ana@example.test",
    status: "shipped",
    currency: "RON",
    totalCents: 10000,
    items: [],
    batchAllocations: [],
    statusHistory: [],
    trackingPreviewUrl: "https://private.example/tracking",
    deliveryLabelUrl: "https://private.example/label",
    createdAt: "2026-07-25T11:00:00.000Z",
  };
  const shipment = {
    documentId: "shipment-1",
    orderDocumentId: "order-1",
    carrier: "jamora-mock",
    service: "standard",
    awb: "JMR000000000000000001",
    status: "in_transit",
    lastTrackingEventAt: "2026-07-25T12:00:00.000Z",
    labelReference: "private-reference",
    labelCapabilityHash: "private-hash",
    createdByActor: "owner@example.test",
    createdAt: "2026-07-25T11:05:00.000Z",
  };
  const findTrackedOrder = createPublicOrderTrackingQuery({
    documents: documentsFixture({
      order,
      shipment,
      events: [{
        status: "in_transit",
        outcome: "applied",
        occurredAt: "2026-07-25T12:00:00.000Z",
        providerEventId: "private-event",
        payloadDigest: "private-digest",
      }],
    }),
    enrichBatchAllocations: async (value) => value,
  });

  const result = await findTrackedOrder("JMR-1001");

  assert.deepEqual(result.shipment, {
    carrier: "jamora-mock",
    service: "standard",
    trackingNumber: "JMR000000000000000001",
    status: "in_transit",
    updatedAt: "2026-07-25T12:00:00.000Z",
    updates: [{
      status: "in_transit",
      occurredAt: "2026-07-25T12:00:00.000Z",
    }],
  });
  const serialized = JSON.stringify(result);
  for (const secret of [
    "private.example",
    "private-reference",
    "private-hash",
    "private-event",
    "private-digest",
    "owner@example.test",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(Object.hasOwn(result, "trackingNumber"), false);
  assert.equal(Object.hasOwn(result, "carrier"), false);
});

test("public tracking still reads legacy carrier and tracking fields without a shipment row", async () => {
  const order = {
    documentId: "legacy-order",
    orderNumber: "JMR-LEGACY",
    trackingNumber: "LEGACY-123",
    carrier: "Legacy Carrier",
    status: "fulfilled",
    email: "legacy@example.test",
    totalCents: 100,
    items: [],
    batchAllocations: [],
    statusHistory: [],
    createdAt: "2026-07-20T11:00:00.000Z",
  };
  const findTrackedOrder = createPublicOrderTrackingQuery({
    documents: documentsFixture({ order, shipment: null }),
    enrichBatchAllocations: async (value) => value,
  });

  const result = await findTrackedOrder("LEGACY-123");

  assert.deepEqual(result.shipment, {
    carrier: "Legacy Carrier",
    service: "",
    trackingNumber: "LEGACY-123",
    status: "delivered",
    updatedAt: "2026-07-20T11:00:00.000Z",
    updates: [],
  });
  assert.equal(result.trackingNumber, "LEGACY-123");
  assert.equal(result.carrier, "Legacy Carrier");
});

test("AWB-only lookup resolves its owning order without trusting legacy order fields", async () => {
  const calls = [];
  const order = {
    documentId: "order-2",
    orderNumber: "JMR-1002",
    status: "shipped",
    email: "safe@example.test",
    totalCents: 100,
    items: [],
    batchAllocations: [],
    statusHistory: [],
    createdAt: "2026-07-20T11:00:00.000Z",
  };
  const shipment = {
    documentId: "shipment-2",
    orderDocumentId: "order-2",
    carrier: "jamora-mock",
    service: "standard",
    awb: "AWB-ONLY-2",
    status: "label_created",
    createdAt: "2026-07-20T11:01:00.000Z",
  };
  const documents = (uid) => {
    if (uid === "api::order.order") {
      return {
        async findMany(input) {
          calls.push([uid, input.filters]);
          return calls.filter(([candidate]) => candidate === uid).length === 1
            ? []
            : [structuredClone(order)];
        },
      };
    }
    if (uid === "api::shipment.shipment") {
      return {
        async findMany(input) {
          calls.push([uid, input.filters]);
          return [structuredClone(shipment)];
        },
      };
    }
    if (uid === "api::shipment-event.shipment-event") {
      return { findMany: async () => [] };
    }
    throw new Error(`Unexpected content type ${uid}`);
  };
  const findTrackedOrder = createPublicOrderTrackingQuery({
    documents,
    enrichBatchAllocations: async (value) => value,
  });

  const result = await findTrackedOrder("AWB-ONLY-2");

  assert.equal(result.documentId, "order-2");
  assert.equal(result.shipment.trackingNumber, "AWB-ONLY-2");
  assert.ok(calls.some(([uid, filters]) =>
    uid === "api::shipment.shipment" && filters.awb.$eqi === "AWB-ONLY-2"));
  assert.ok(calls.some(([uid, filters]) =>
    uid === "api::order.order" && filters.documentId?.$eq === "order-2"));
});
