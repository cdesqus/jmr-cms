import assert from "node:assert/strict";
import test from "node:test";

import trackingModule from "./tracking-domain.cjs";

const {
  createMemoryTrackingAdapter,
  createTrackingDomain,
  publicTrackingProjection,
  runShippingTrackingStartupPoll,
  trackingTransition,
} = trackingModule;

const NOW = "2026-07-25T12:00:00.000Z";

function shipment(overrides = {}) {
  return {
    documentId: "shipment-1",
    orderDocumentId: "order-1",
    orderNumber: "JMR-1001",
    provider: "jamora-mock",
    carrier: "jamora-mock",
    service: "standard",
    awb: "JMR000000000000000001",
    status: "label_created",
    trackingProgressStatus: "label_created",
    createdAt: NOW,
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    providerEventId: "tracking-event-1",
    provider: "jamora-mock",
    awb: "JMR000000000000000001",
    status: "picked_up",
    occurredAt: "2026-07-25T12:01:00.000Z",
    ...overrides,
  };
}

test("tracking transition table advances, recovers exceptions, and keeps delivered/returned terminal", () => {
  assert.deepEqual(
    trackingTransition("label_created", "label_created", "in_transit"),
    { applied: true, outcome: "applied", status: "in_transit", progressStatus: "in_transit" },
  );
  assert.deepEqual(
    trackingTransition("in_transit", "in_transit", "exception"),
    { applied: true, outcome: "applied", status: "exception", progressStatus: "in_transit" },
  );
  assert.deepEqual(
    trackingTransition("exception", "in_transit", "picked_up"),
    { applied: false, outcome: "ignored_out_of_order", status: "exception", progressStatus: "in_transit" },
  );
  assert.deepEqual(
    trackingTransition("exception", "in_transit", "in_transit"),
    { applied: true, outcome: "applied", status: "in_transit", progressStatus: "in_transit" },
  );
  assert.deepEqual(
    trackingTransition("delivered", "delivered", "returned"),
    { applied: false, outcome: "ignored_terminal", status: "delivered", progressStatus: "delivered" },
  );
  assert.deepEqual(
    trackingTransition("returned", "in_transit", "delivered"),
    { applied: false, outcome: "ignored_terminal", status: "returned", progressStatus: "in_transit" },
  );
});

test("verified tracking observations append once and exact provider-event replay is idempotent", async () => {
  const adapter = createMemoryTrackingAdapter({ shipments: [shipment()] });
  const domain = createTrackingDomain({ adapter });

  const applied = await domain.applyTrackingEvent({
    event: observation(),
    source: "webhook",
    receivedAt: "2026-07-25T12:01:01.000Z",
  });
  const replay = await domain.applyTrackingEvent({
    event: observation(),
    source: "webhook",
    receivedAt: "2026-07-25T12:02:00.000Z",
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.idempotent, false);
  assert.equal(replay.idempotent, true);
  assert.equal(adapter.events.size, 1);
  assert.equal(adapter.shipments.get("shipment-1").status, "picked_up");
  assert.deepEqual(adapter.lockLog, ["shipment-1", "shipment-1"]);
});

test("provider-event replay is bound to its canonical observation", async () => {
  const adapter = createMemoryTrackingAdapter({ shipments: [shipment()] });
  const domain = createTrackingDomain({ adapter });
  await domain.applyTrackingEvent({ event: observation(), source: "webhook" });

  await assert.rejects(
    domain.applyTrackingEvent({
      event: observation({ status: "delivered" }),
      source: "webhook",
    }),
    /provider event replay conflict/i,
  );
  assert.equal(adapter.events.size, 1);
  assert.equal(adapter.shipments.get("shipment-1").status, "picked_up");
});

test("foreign AWB is rejected without creating an event", async () => {
  const adapter = createMemoryTrackingAdapter({ shipments: [shipment()] });
  const domain = createTrackingDomain({ adapter });

  await assert.rejects(
    domain.applyTrackingEvent({
      event: observation({
        providerEventId: "foreign-event",
        awb: "JMR999999999999999999",
      }),
      source: "webhook",
    }),
    /shipment not found/i,
  );
  assert.equal(adapter.events.size, 0);
});

test("duplicate, out-of-order, exception recovery, and returned-terminal observations remain auditable", async () => {
  const adapter = createMemoryTrackingAdapter({ shipments: [shipment()] });
  const domain = createTrackingDomain({ adapter });
  const apply = (providerEventId, status, minute) => domain.applyTrackingEvent({
    event: observation({
      providerEventId,
      status,
      occurredAt: `2026-07-25T12:${String(minute).padStart(2, "0")}:00.000Z`,
    }),
    source: "webhook",
  });

  await apply("evt-transit", "in_transit", 2);
  const duplicate = await apply("evt-transit-duplicate", "in_transit", 3);
  const exception = await apply("evt-exception", "exception", 4);
  const regression = await apply("evt-pickup-late", "picked_up", 5);
  const recovery = await apply("evt-recover", "in_transit", 6);
  const returned = await apply("evt-returned", "returned", 7);
  const terminal = await apply("evt-after-return", "delivered", 8);

  assert.equal(duplicate.outcome, "ignored_duplicate");
  assert.equal(exception.outcome, "applied");
  assert.equal(regression.outcome, "ignored_out_of_order");
  assert.equal(recovery.outcome, "applied");
  assert.equal(returned.outcome, "applied");
  assert.equal(terminal.outcome, "ignored_terminal");
  assert.equal(adapter.events.size, 7);
  assert.equal(adapter.shipments.get("shipment-1").status, "returned");
  assert.equal(
    adapter.shipments.get("shipment-1").trackingProgressStatus,
    "in_transit",
  );
});

test("an older provider occurrence cannot advance state even when it arrives later", async () => {
  const adapter = createMemoryTrackingAdapter({
    shipments: [shipment({
      status: "in_transit",
      trackingProgressStatus: "in_transit",
      lastTrackingEventAt: "2026-07-25T12:10:00.000Z",
    })],
  });
  const domain = createTrackingDomain({ adapter });

  const result = await domain.applyTrackingEvent({
    event: observation({
      providerEventId: "late-delivered",
      status: "delivered",
      occurredAt: "2026-07-25T12:09:59.000Z",
    }),
    source: "webhook",
  });

  assert.equal(result.outcome, "ignored_out_of_order");
  assert.equal(adapter.shipments.get("shipment-1").status, "in_transit");
  assert.equal(adapter.events.size, 1);
});

test("bounded polling covers only open shipments and is idempotent through the shared transition", async () => {
  const shipments = [
    shipment(),
    shipment({
      documentId: "shipment-2",
      orderDocumentId: "order-2",
      awb: "JMR000000000000000002",
    }),
    shipment({
      documentId: "shipment-3",
      orderDocumentId: "order-3",
      awb: "JMR000000000000000003",
    }),
    shipment({
      documentId: "shipment-delivered",
      orderDocumentId: "order-delivered",
      awb: "JMR000000000000000004",
      status: "delivered",
      trackingProgressStatus: "delivered",
    }),
  ];
  const polls = [];
  const provider = {
    provider: "jamora-mock",
    async pollTracking(candidate) {
      polls.push(candidate.awb);
      return observation({
        providerEventId: `poll:${candidate.awb}:in_transit`,
        awb: candidate.awb,
        status: "in_transit",
      });
    },
  };
  const adapter = createMemoryTrackingAdapter({ shipments });
  const domain = createTrackingDomain({ adapter, provider });

  const first = await domain.pollOpenShipments({ limit: 2 });
  const second = await domain.pollOpenShipments({ limit: 2 });
  const third = await domain.pollOpenShipments({ limit: 2 });

  assert.deepEqual(first, {
    attempted: 2,
    applied: 2,
    replayed: 0,
    ignored: 0,
    failed: 0,
  });
  assert.deepEqual(second, {
    attempted: 2,
    applied: 1,
    replayed: 1,
    ignored: 0,
    failed: 0,
  });
  assert.deepEqual(third, {
    attempted: 2,
    applied: 0,
    replayed: 2,
    ignored: 0,
    failed: 0,
  });
  assert.deepEqual(polls, [
    "JMR000000000000000001",
    "JMR000000000000000002",
    "JMR000000000000000003",
    "JMR000000000000000001",
    "JMR000000000000000001",
    "JMR000000000000000002",
  ]);
  assert.equal(adapter.events.size, 3);
  assert.ok(!polls.includes("JMR000000000000000004"));
  assert.ok(adapter.lockLog.length >= 4);
});

test("public tracking projection exposes safe events and preserves legacy reads", () => {
  assert.deepEqual(publicTrackingProjection({
    shipment: shipment({
      status: "in_transit",
      lastTrackingEventAt: "2026-07-25T12:05:00.000Z",
      labelReference: "private-label",
      labelCapabilityHash: "private-capability",
      createdByActor: "owner@example.test",
    }),
    events: [{
      documentId: "shipment-event-1",
      providerEventId: "private-provider-event",
      source: "webhook",
      status: "in_transit",
      outcome: "applied",
      occurredAt: "2026-07-25T12:05:00.000Z",
      payloadDigest: "private-digest",
    }],
  }), {
    carrier: "jamora-mock",
    service: "standard",
    trackingNumber: "JMR000000000000000001",
    status: "in_transit",
    updatedAt: "2026-07-25T12:05:00.000Z",
    updates: [{
      status: "in_transit",
      occurredAt: "2026-07-25T12:05:00.000Z",
    }],
  });

  assert.deepEqual(publicTrackingProjection({
    legacyOrder: {
      carrier: "Legacy Carrier",
      trackingNumber: "LEGACY-123",
      status: "fulfilled",
      createdAt: NOW,
      trackingPreviewUrl: "https://private.example/tracking",
      deliveryLabelUrl: "https://private.example/label",
    },
  }), {
    carrier: "Legacy Carrier",
    service: "",
    trackingNumber: "LEGACY-123",
    status: "delivered",
    updatedAt: NOW,
    updates: [],
  });
});

test("startup polling is exact-gated, bounded, and failure-safe", async () => {
  const calls = [];
  const domain = {
    async pollOpenShipments(input) {
      calls.push(input);
      return { attempted: input.limit };
    },
  };
  const warnings = [];
  assert.equal(await runShippingTrackingStartupPoll(
    domain,
    { warn: (...args) => warnings.push(args) },
    { enabled: "TRUE", limit: 999 },
  ), null);
  assert.deepEqual(calls, []);

  assert.deepEqual(await runShippingTrackingStartupPoll(
    domain,
    { warn: (...args) => warnings.push(args) },
    { enabled: "true", limit: 999 },
  ), { attempted: 100 });
  assert.deepEqual(calls, [{ limit: 100 }]);

  const failed = await runShippingTrackingStartupPoll(
    { pollOpenShipments: async () => { throw new Error("provider unavailable"); } },
    { warn: (...args) => warnings.push(args) },
    { enabled: "true", limit: 2 },
  );
  assert.equal(failed, null);
  assert.equal(warnings.length, 1);
});
