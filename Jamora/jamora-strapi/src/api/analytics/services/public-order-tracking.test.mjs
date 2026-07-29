import assert from "node:assert/strict";
import test from "node:test";

import publicTrackingModule from "./public-order-tracking.cjs";

const {
  createPublicOrderTrackingLimiter,
  createPublicOrderTrackingPrivacyFloor,
  createPublicOrderTrackingQuery,
  issuePublicTrackingCapability,
  publicTrackingCapabilityDigest,
} = publicTrackingModule;

const TRACKING_ACCESS = `trk_${"A".repeat(43)}`;

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
    trackingCapabilityHash: publicTrackingCapabilityDigest(TRACKING_ACCESS),
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

  const result = await findTrackedOrder("JMR-1001", TRACKING_ACCESS);

  assert.deepEqual(result, {
    orderNumber: "JMR-1001",
    status: "shipped",
    createdAt: "2026-07-25T11:00:00.000Z",
    shipment: {
      carrier: "jamora-mock",
      service: "standard",
      trackingNumber: "JMR000000000000000001",
      status: "in_transit",
      updatedAt: "2026-07-25T12:00:00.000Z",
      updates: [{
        status: "in_transit",
        occurredAt: "2026-07-25T12:00:00.000Z",
      }],
    },
  });
  const serialized = JSON.stringify(result);
  for (const secret of [
    "Ana",
    "ana@example.test",
    "10000",
    "private.example",
    "private-reference",
    "private-hash",
    "private-event",
    "private-digest",
    "owner@example.test",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  for (const forbidden of [
    "documentId",
    "customerName",
    "email",
    "shippingAddress",
    "items",
    "subtotalCents",
    "shippingCents",
    "discountCents",
    "totalCents",
    "invoiceNumber",
    "packedBy",
    "fulfilmentChecklist",
    "batchAllocations",
    "statusHistory",
    "trackingCapabilityHash",
    "trackingPreviewUrl",
  ]) {
    assert.equal(Object.hasOwn(result, forbidden), false);
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
    trackingCapabilityHash: publicTrackingCapabilityDigest(TRACKING_ACCESS),
    createdAt: "2026-07-20T11:00:00.000Z",
  };
  const findTrackedOrder = createPublicOrderTrackingQuery({
    documents: documentsFixture({ order, shipment: null }),
    enrichBatchAllocations: async (value) => value,
  });

  const result = await findTrackedOrder("LEGACY-123", TRACKING_ACCESS);

  assert.deepEqual(result, {
    orderNumber: "JMR-LEGACY",
    status: "fulfilled",
    createdAt: "2026-07-20T11:00:00.000Z",
    shipment: {
      carrier: "Legacy Carrier",
      service: "",
      trackingNumber: "LEGACY-123",
      status: "delivered",
      updatedAt: "2026-07-20T11:00:00.000Z",
      updates: [],
    },
  });
  assert.equal(Object.hasOwn(result, "trackingNumber"), false);
  assert.equal(Object.hasOwn(result, "carrier"), false);
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
    trackingCapabilityHash: publicTrackingCapabilityDigest(TRACKING_ACCESS),
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

  const result = await findTrackedOrder("AWB-ONLY-2", TRACKING_ACCESS);

  assert.equal(result.orderNumber, "JMR-1002");
  assert.equal(Object.hasOwn(result, "documentId"), false);
  assert.equal(result.shipment.trackingNumber, "AWB-ONLY-2");
  assert.ok(calls.some(([uid, filters]) =>
    uid === "api::shipment.shipment" && filters.awb.$eqi === "AWB-ONLY-2"));
  assert.ok(calls.some(([uid, filters]) =>
    uid === "api::order.order" && filters.documentId?.$eq === "order-2"));
});

test("public tracking requires an unguessable order-bound capability", async () => {
  const order = {
    documentId: "order-private",
    orderNumber: "JMR-GUESSABLE-1",
    status: "shipped",
    trackingCapabilityHash: publicTrackingCapabilityDigest(TRACKING_ACCESS),
    createdAt: "2026-07-20T11:00:00.000Z",
  };
  const findTrackedOrder = createPublicOrderTrackingQuery({
    documents: documentsFixture({ order, shipment: null }),
  });

  assert.equal(await findTrackedOrder("JMR-GUESSABLE-1", ""), null);
  assert.equal(
    await findTrackedOrder("JMR-GUESSABLE-1", `trk_${"B".repeat(43)}`),
    null,
  );
  assert.equal(
    (await findTrackedOrder("JMR-GUESSABLE-1", TRACKING_ACCESS)).orderNumber,
    "JMR-GUESSABLE-1",
  );
});

test("tracking capability issuance stores only a digest beside a secure preview URL", () => {
  const issued = issuePublicTrackingCapability({
    storefrontUrl: "https://shop.example.test/",
    orderNumber: "JMR-2026-123",
    randomBytes: () => Buffer.alloc(32, 7),
  });

  assert.match(issued.access, /^trk_[A-Za-z0-9_-]{43}$/);
  assert.match(issued.digest, /^[a-f0-9]{64}$/);
  assert.equal(issued.digest, publicTrackingCapabilityDigest(issued.access));
  assert.equal(
    issued.previewUrl,
    `https://shop.example.test/track?order=JMR-2026-123&access=${encodeURIComponent(issued.access)}`,
  );
  assert.equal(issued.digest.includes(issued.access), false);
});

test("public tracking limiter is IP-bound, generic, expiring, and storage-bounded", () => {
  let now = 0;
  const limiter = createPublicOrderTrackingLimiter({
    limit: 2,
    windowMs: 1_000,
    maxBuckets: 3,
    now: () => now,
  });
  assert.deepEqual(limiter.check("192.0.2.1"), { allowed: true });
  assert.deepEqual(limiter.check("192.0.2.1"), { allowed: true });
  assert.deepEqual(limiter.check("192.0.2.1"), {
    allowed: false,
    retryAfter: 1,
  });
  assert.deepEqual(limiter.check("192.0.2.2"), { allowed: true });
  for (let index = 3; index < 20; index += 1) {
    limiter.check(`192.0.2.${index}`);
  }
  assert.ok(limiter.bucketCount() <= 3);
  now = 1_001;
  assert.deepEqual(limiter.check("192.0.2.1"), { allowed: true });
});

test("found and not-found public tracking requests share the same privacy floor", async () => {
  let now = 1_000;
  const waits = [];
  const floor = createPublicOrderTrackingPrivacyFloor({
    minimumMs: 150,
    now: () => now,
    wait: async (duration) => {
      waits.push(duration);
      now += duration;
    },
  });

  await floor(1_000);
  now = 2_120;
  await floor(2_000);

  assert.deepEqual(waits, [150, 30]);
});
