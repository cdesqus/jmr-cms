import assert from "node:assert/strict";
import test from "node:test";

import trackingModule from "./tracking-domain.cjs";

const {
  createMemoryTrackingAdapter,
  createStrapiTrackingAdapter,
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
  await domain.applyTrackingEvent({
    event: observation(),
    source: "webhook",
    receivedAt: "2026-07-25T12:02:00.000Z",
  });

  await assert.rejects(
    domain.applyTrackingEvent({
      event: observation({ status: "delivered" }),
      source: "webhook",
      receivedAt: "2026-07-25T12:02:00.000Z",
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
      receivedAt: "2026-07-25T12:02:00.000Z",
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
    receivedAt: "2026-07-25T12:10:00.000Z",
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
    receivedAt: "2026-07-25T12:11:00.000Z",
  });

  assert.equal(result.outcome, "ignored_out_of_order");
  assert.equal(adapter.shipments.get("shipment-1").status, "in_transit");
  assert.equal(adapter.events.size, 1);
});

test("newer ignored observations advance only the observation watermark", async () => {
  const adapter = createMemoryTrackingAdapter({
    shipments: [shipment({
      status: "in_transit",
      trackingProgressStatus: "in_transit",
      lastTrackingObservedAt: "2026-07-25T12:02:00.000Z",
      lastTrackingAppliedAt: "2026-07-25T12:02:00.000Z",
    })],
  });
  const domain = createTrackingDomain({ adapter });
  const duplicate = await domain.applyTrackingEvent({
    event: observation({
      providerEventId: "newer-duplicate",
      status: "in_transit",
      occurredAt: "2026-07-25T12:03:00.000Z",
    }),
    source: "webhook",
    receivedAt: "2026-07-25T12:03:01.000Z",
  });
  const regression = await domain.applyTrackingEvent({
    event: observation({
      providerEventId: "newer-regression",
      status: "picked_up",
      occurredAt: "2026-07-25T12:04:00.000Z",
    }),
    source: "webhook",
    receivedAt: "2026-07-25T12:04:01.000Z",
  });
  const staleAdvance = await domain.applyTrackingEvent({
    event: observation({
      providerEventId: "stale-advance",
      status: "delivered",
      occurredAt: "2026-07-25T12:03:30.000Z",
    }),
    source: "webhook",
    receivedAt: "2026-07-25T12:05:00.000Z",
  });

  assert.equal(duplicate.outcome, "ignored_duplicate");
  assert.equal(regression.outcome, "ignored_out_of_order");
  assert.equal(staleAdvance.outcome, "ignored_out_of_order");
  assert.equal(
    adapter.shipments.get("shipment-1").lastTrackingObservedAt,
    "2026-07-25T12:04:00.000Z",
  );
  assert.equal(
    adapter.shipments.get("shipment-1").lastTrackingAppliedAt,
    "2026-07-25T12:02:00.000Z",
  );
  assert.equal(adapter.shipments.get("shipment-1").status, "in_transit");
});

test("future and unreasonably old observations are rejected before persistence", async () => {
  const adapter = createMemoryTrackingAdapter({ shipments: [shipment()] });
  const domain = createTrackingDomain({ adapter });
  for (const [providerEventId, occurredAt] of [
    ["future-poison", "2026-07-25T12:06:01.000Z"],
    ["ancient-observation", "2026-06-24T12:00:00.000Z"],
  ]) {
    await assert.rejects(
      domain.applyTrackingEvent({
        event: observation({ providerEventId, occurredAt }),
        source: "webhook",
        receivedAt: "2026-07-25T12:00:00.000Z",
      }),
      /occurrence time is outside/i,
    );
  }
  assert.equal(adapter.events.size, 0);
  assert.equal(
    adapter.shipments.get("shipment-1").lastTrackingObservedAt,
    undefined,
  );
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

  const pollNow = new Date("2026-07-25T12:02:00.000Z");
  const first = await domain.pollOpenShipments({ limit: 2, now: pollNow });
  const second = await domain.pollOpenShipments({ limit: 2, now: pollNow });
  const third = await domain.pollOpenShipments({ limit: 2, now: pollNow });

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
  assert.equal(
    adapter.shipments.get("shipment-1").lastPollAttemptAt,
    "2026-07-25T12:02:00.000Z",
  );
  assert.equal(
    adapter.shipments.get("shipment-3").lastPollAttemptAt,
    "2026-07-25T12:02:00.000Z",
  );
});

test("failed and unchanged polls persist fairness attempts so other shipments are not starved", async () => {
  const adapter = createMemoryTrackingAdapter({
    shipments: [
      shipment(),
      shipment({
        documentId: "shipment-2",
        orderDocumentId: "order-2",
        awb: "JMR000000000000000002",
      }),
    ],
  });
  const polled = [];
  const provider = {
    async pollTracking(candidate) {
      polled.push(candidate.awb);
      if (candidate.awb.endsWith("1")) throw new Error("provider unavailable");
      return observation({
        providerEventId: `unchanged:${candidate.awb}`,
        awb: candidate.awb,
        status: "label_created",
      });
    },
  };
  const domain = createTrackingDomain({ adapter, provider });

  assert.deepEqual(await domain.pollOpenShipments({
    limit: 1,
    now: new Date("2026-07-25T12:10:00.000Z"),
  }), {
    attempted: 1,
    applied: 0,
    replayed: 0,
    ignored: 0,
    failed: 1,
  });
  assert.deepEqual(await domain.pollOpenShipments({
    limit: 1,
    now: new Date("2026-07-25T12:11:00.000Z"),
  }), {
    attempted: 1,
    applied: 0,
    replayed: 0,
    ignored: 1,
    failed: 0,
  });
  assert.deepEqual(polled, [
    "JMR000000000000000001",
    "JMR000000000000000002",
  ]);
  assert.equal(
    adapter.shipments.get("shipment-1").lastPollAttemptAt,
    "2026-07-25T12:10:00.000Z",
  );
  assert.equal(
    adapter.shipments.get("shipment-2").lastPollAttemptAt,
    "2026-07-25T12:11:00.000Z",
  );
});

test("poll rejects a foreign provider/AWB event without mutating its shipment", async () => {
  const adapter = createMemoryTrackingAdapter({
    shipments: [
      shipment(),
      shipment({
        documentId: "shipment-2",
        orderDocumentId: "order-2",
        provider: "foreign-provider",
        carrier: "foreign-provider",
        awb: "FOREIGN000000000000002",
      }),
    ],
  });
  const domain = createTrackingDomain({
    adapter,
    provider: {
      async pollTracking() {
        return observation({
          providerEventId: "foreign-poll-event",
          provider: "foreign-provider",
          awb: "FOREIGN000000000000002",
        });
      },
    },
  });

  assert.deepEqual(await domain.pollOpenShipments({
    limit: 1,
    now: new Date("2026-07-25T12:10:00.000Z"),
  }), {
    attempted: 1,
    applied: 0,
    replayed: 0,
    ignored: 0,
    failed: 1,
  });
  assert.equal(adapter.shipments.get("shipment-1").status, "label_created");
  assert.equal(adapter.shipments.get("shipment-2").status, "label_created");
  assert.equal(adapter.events.size, 0);
  assert.deepEqual(adapter.pollMismatchAudits, [{
    shipmentDocumentId: "shipment-1",
    reason: "provider_or_awb_mismatch",
    attemptedAt: "2026-07-25T12:10:00.000Z",
  }]);
  assert.doesNotMatch(
    JSON.stringify(adapter.pollMismatchAudits),
    /FOREIGN000|foreign-provider/,
  );
});

test("PostgreSQL polling explicitly selects never-polled shipments before oldest attempts", async () => {
  const calls = [];
  const rows = {
    never: [
      shipment({ documentId: "never-1", lastPollAttemptAt: null }),
      shipment({ documentId: "never-2", lastPollAttemptAt: null }),
    ],
    polled: [
      shipment({
        documentId: "polled-1",
        lastPollAttemptAt: "2026-07-25T11:00:00.000Z",
      }),
    ],
  };
  const strapi = {
    db: {
      query(uid) {
        assert.equal(uid, "api::shipment.shipment");
        return {
          async findMany(input) {
            calls.push(structuredClone(input));
            if (input.where.lastPollAttemptAt?.$null === true) {
              return structuredClone(rows.never.slice(0, input.limit));
            }
            if (input.where.lastPollAttemptAt?.$notNull === true) {
              return structuredClone(rows.polled.slice(0, input.limit));
            }
            return [];
          },
        };
      },
    },
  };

  const result = await createStrapiTrackingAdapter(strapi)
    .listOpenShipments(3);

  assert.deepEqual(
    result.map((candidate) => candidate.documentId),
    ["never-1", "never-2", "polled-1"],
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].where.lastPollAttemptAt.$null, true);
  assert.equal(calls[0].limit, 3);
  assert.deepEqual(calls[0].orderBy, [{ createdAt: "asc" }]);
  assert.equal(calls[1].where.lastPollAttemptAt.$notNull, true);
  assert.equal(calls[1].limit, 1);
  assert.deepEqual(calls[1].orderBy, [
    { lastPollAttemptAt: "asc" },
    { createdAt: "asc" },
  ]);
  for (const call of calls) {
    assert.deepEqual(call.where.status, {
      $notIn: ["delivered", "returned"],
    });
  }
});

test("polling aborts hung provider calls and stops at the total deadline", async () => {
  const adapter = createMemoryTrackingAdapter({
    shipments: [
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
    ],
  });
  const signals = [];
  const domain = createTrackingDomain({
    adapter,
    provider: {
      pollTracking(_candidate, { signal }) {
        signals.push(signal);
        return new Promise(() => {});
      },
    },
  });
  const startedAt = Date.now();
  const summary = await domain.pollOpenShipments({
    limit: 3,
    perCallTimeoutMs: 20,
    totalTimeoutMs: 30,
  });

  assert.ok(Date.now() - startedAt < 250);
  assert.ok(summary.attempted >= 1 && summary.attempted < 3);
  assert.equal(summary.failed, summary.attempted);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(
    [...adapter.shipments.values()]
      .filter((candidate) => candidate.lastPollAttemptAt).length,
    summary.attempted,
  );
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
  const infos = [];
  assert.equal(await runShippingTrackingStartupPoll(
    domain,
    {
      info: (...args) => infos.push(args),
      warn: (...args) => warnings.push(args),
    },
    { enabled: "TRUE", limit: 999 },
  ), null);
  assert.deepEqual(calls, []);

  assert.deepEqual(await runShippingTrackingStartupPoll(
    domain,
    {
      info: (...args) => infos.push(args),
      warn: (...args) => warnings.push(args),
    },
    { enabled: "true", limit: 999 },
  ), {
    attempted: 100,
    applied: 0,
    replayed: 0,
    ignored: 0,
    failed: 0,
  });
  assert.deepEqual(calls, [{
    limit: 100,
    totalTimeoutMs: 10_000,
  }]);
  assert.deepEqual(infos, [[
    "Shipping tracking startup poll completed.",
    { attempted: 100, applied: 0, replayed: 0, ignored: 0, failed: 0 },
  ]]);

  const failed = await runShippingTrackingStartupPoll(
    { pollOpenShipments: async () => { throw new Error("provider unavailable"); } },
    { warn: (...args) => warnings.push(args) },
    { enabled: "true", limit: 2 },
  );
  assert.equal(failed, null);
  assert.equal(warnings.length, 1);
  assert.equal(JSON.stringify(warnings).includes("provider unavailable"), false);

  const hungAt = Date.now();
  const hung = await runShippingTrackingStartupPoll(
    { pollOpenShipments: async () => new Promise(() => {}) },
    { warn: (...args) => warnings.push(args) },
    { enabled: "true", limit: 2, startupTimeoutMs: 10 },
  );
  assert.equal(hung, null);
  assert.ok(Date.now() - hungAt < 200);
});
