"use strict";

const { createHash } = require("node:crypto");

const PROGRESS_STATES = Object.freeze([
  "label_created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
]);
const TRACKING_STATES = Object.freeze([
  ...PROGRESS_STATES,
  "exception",
  "returned",
]);
const TERMINAL_STATES = new Set(["delivered", "returned"]);
const SOURCES = new Set(["webhook", "poll"]);
const OUTCOMES = new Set([
  "applied",
  "ignored_duplicate",
  "ignored_out_of_order",
  "ignored_terminal",
]);
const DEFAULT_POLL_LIMIT = 25;
const MAX_POLL_LIMIT = 100;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value, label) {
  const normalized = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(normalized)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
}

function trackingStatus(value) {
  const normalized = text(value).toLowerCase();
  if (!TRACKING_STATES.includes(normalized)) {
    throw new TypeError("Tracking status is invalid.");
  }
  return normalized;
}

function iso(value, label) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new TypeError(`${label} is invalid.`);
  }
  return parsed.toISOString();
}

function sourceName(value) {
  const source = text(value).toLowerCase();
  if (!SOURCES.has(source)) throw new TypeError("Tracking event source is invalid.");
  return source;
}

function progressStatus(value, currentStatus) {
  const normalized = text(value).toLowerCase();
  if (PROGRESS_STATES.includes(normalized)) return normalized;
  if (PROGRESS_STATES.includes(currentStatus)) return currentStatus;
  return "label_created";
}

function normaliseTrackingEvent(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError("Tracking event is invalid.");
  }
  return {
    providerEventId: identifier(value.providerEventId, "Provider event ID"),
    provider: identifier(value.provider, "Tracking provider"),
    awb: identifier(value.awb, "Tracking AWB"),
    status: trackingStatus(value.status),
    occurredAt: iso(value.occurredAt, "Tracking occurrence time"),
  };
}

function eventDigest(event) {
  return createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex");
}

function trackingTransition(currentValue, progressValue, nextValue) {
  const current = trackingStatus(currentValue);
  const progress = progressStatus(progressValue, current);
  const next = trackingStatus(nextValue);
  if (TERMINAL_STATES.has(current)) {
    return {
      applied: false,
      outcome: current === next ? "ignored_duplicate" : "ignored_terminal",
      status: current,
      progressStatus: progress,
    };
  }
  if (current === next) {
    return {
      applied: false,
      outcome: "ignored_duplicate",
      status: current,
      progressStatus: progress,
    };
  }
  if (next === "returned") {
    return {
      applied: true,
      outcome: "applied",
      status: "returned",
      progressStatus: progress,
    };
  }
  if (next === "exception") {
    return {
      applied: true,
      outcome: "applied",
      status: "exception",
      progressStatus: progress,
    };
  }
  const nextRank = PROGRESS_STATES.indexOf(next);
  const progressRank = PROGRESS_STATES.indexOf(progress);
  if (nextRank < progressRank) {
    return {
      applied: false,
      outcome: "ignored_out_of_order",
      status: current,
      progressStatus: progress,
    };
  }
  if (current !== "exception" && nextRank === progressRank) {
    return {
      applied: false,
      outcome: "ignored_duplicate",
      status: current,
      progressStatus: progress,
    };
  }
  return {
    applied: true,
    outcome: "applied",
    status: next,
    progressStatus: next,
  };
}

function safeShipmentResult(shipment) {
  return {
    documentId: shipment.documentId,
    orderDocumentId: shipment.orderDocumentId,
    orderNumber: shipment.orderNumber,
    carrier: shipment.carrier,
    service: shipment.service,
    awb: shipment.awb,
    status: shipment.status,
    updatedAt: shipment.lastTrackingEventAt ?? shipment.updatedAt ?? shipment.createdAt,
  };
}

async function applyTrackingEvent({
  adapter,
  event,
  source,
  receivedAt = new Date(),
}) {
  if (!adapter?.transaction) throw new TypeError("Tracking adapter is required.");
  const normalized = normaliseTrackingEvent(event);
  const normalizedSource = sourceName(source);
  const received = iso(receivedAt, "Tracking receipt time");
  const payloadDigest = eventDigest(normalized);

  return adapter.transaction(async (tx) => {
    const shipment = await tx.lockShipmentByAwb(
      normalized.provider,
      normalized.awb,
    );
    if (!shipment) throw new Error("Shipment not found.");
    const replay = await tx.findEventByProviderEventId(
      normalized.providerEventId,
    );
    if (replay) {
      if (replay.payloadDigest !== payloadDigest ||
          replay.shipmentDocumentId !== shipment.documentId) {
        throw new Error("Provider event replay conflict.");
      }
      return {
        idempotent: true,
        applied: false,
        outcome: replay.outcome,
        shipment: safeShipmentResult(shipment),
      };
    }

    const currentStatus = trackingStatus(shipment.status);
    const currentProgress = progressStatus(
      shipment.trackingProgressStatus,
      currentStatus,
    );
    let transition = trackingTransition(
      currentStatus,
      currentProgress,
      normalized.status,
    );
    const lastOccurrence = shipment.lastTrackingEventAt
      ? new Date(shipment.lastTrackingEventAt)
      : null;
    if (transition.applied &&
        lastOccurrence &&
        Number.isFinite(lastOccurrence.getTime()) &&
        new Date(normalized.occurredAt) < lastOccurrence) {
      transition = {
        applied: false,
        outcome: "ignored_out_of_order",
        status: currentStatus,
        progressStatus: currentProgress,
      };
    }
    if (!OUTCOMES.has(transition.outcome)) {
      throw new Error("Tracking transition outcome is invalid.");
    }

    let effectiveShipment = shipment;
    if (transition.applied) {
      effectiveShipment = await tx.updateShipment(shipment.documentId, {
        status: transition.status,
        trackingProgressStatus: transition.progressStatus,
        lastTrackingEventAt: normalized.occurredAt,
      });
    }
    await tx.createEvent({
      providerEventId: normalized.providerEventId,
      shipmentDocumentId: shipment.documentId,
      orderDocumentId: shipment.orderDocumentId,
      provider: normalized.provider,
      awb: normalized.awb,
      source: normalizedSource,
      status: normalized.status,
      previousStatus: currentStatus,
      effectiveStatus: transition.status,
      outcome: transition.outcome,
      occurredAt: normalized.occurredAt,
      receivedAt: received,
      payloadDigest,
    });
    return {
      idempotent: false,
      applied: transition.applied,
      outcome: transition.outcome,
      shipment: safeShipmentResult(effectiveShipment),
    };
  });
}

function pollLimit(value, fallback = DEFAULT_POLL_LIMIT) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError("Tracking poll limit is invalid.");
  }
  return Math.min(parsed, MAX_POLL_LIMIT);
}

async function pollOpenShipments({
  adapter,
  provider,
  limit = DEFAULT_POLL_LIMIT,
  now = new Date(),
}) {
  if (!adapter?.listOpenShipments) {
    throw new TypeError("Tracking adapter is required.");
  }
  if (!provider?.pollTracking) {
    throw new TypeError("Tracking polling provider is required.");
  }
  const boundedLimit = pollLimit(limit);
  const open = await adapter.listOpenShipments(boundedLimit);
  if (!Array.isArray(open) || open.length > boundedLimit) {
    throw new Error("Tracking poll result is not bounded.");
  }
  const summary = {
    attempted: 0,
    applied: 0,
    replayed: 0,
    ignored: 0,
    failed: 0,
  };
  for (const shipment of open) {
    summary.attempted += 1;
    try {
      const event = await provider.pollTracking(safeShipmentResult(shipment));
      const result = await applyTrackingEvent({
        adapter,
        event,
        source: "poll",
        receivedAt: now,
      });
      if (result.idempotent) summary.replayed += 1;
      else if (result.applied) summary.applied += 1;
      else summary.ignored += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

function createTrackingDomain({ adapter, provider } = {}) {
  return {
    applyTrackingEvent: (input) => applyTrackingEvent({ adapter, ...input }),
    pollOpenShipments: (input = {}) =>
      pollOpenShipments({ adapter, provider, ...input }),
  };
}

function legacyTrackingStatus(order) {
  const orderStatus = text(order?.status).toLowerCase();
  if (orderStatus === "fulfilled") return "delivered";
  if (orderStatus === "shipped") return "in_transit";
  return text(order?.trackingNumber) ? "label_created" : null;
}

function publicTrackingProjection({
  shipment,
  events = [],
  legacyOrder,
} = {}) {
  if (shipment) {
    const safeUpdates = (Array.isArray(events) ? events : [])
      .filter((event) =>
        event?.outcome === "applied" &&
        TRACKING_STATES.includes(text(event?.status).toLowerCase()))
      .map((event) => ({
        status: text(event.status).toLowerCase(),
        occurredAt: iso(event.occurredAt, "Tracking occurrence time"),
      }))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    return {
      carrier: text(shipment.carrier),
      service: text(shipment.service),
      trackingNumber: text(shipment.awb),
      status: trackingStatus(shipment.status),
      updatedAt: iso(
        shipment.lastTrackingEventAt ??
          shipment.updatedAt ??
          shipment.createdAt,
        "Tracking update time",
      ),
      updates: safeUpdates,
    };
  }
  const trackingNumber = text(legacyOrder?.trackingNumber);
  if (!trackingNumber) return null;
  return {
    carrier: text(legacyOrder?.carrier),
    service: "",
    trackingNumber,
    status: legacyTrackingStatus(legacyOrder),
    updatedAt: iso(
      legacyOrder?.updatedAt ?? legacyOrder?.createdAt,
      "Tracking update time",
    ),
    updates: [],
  };
}

function createMemoryTrackingAdapter({
  shipments = [],
  events = [],
} = {}) {
  const adapter = {
    shipments: new Map(shipments.map((candidate) => [
      candidate.documentId,
      structuredClone(candidate),
    ])),
    events: new Map(events.map((event) => [
      event.providerEventId,
      structuredClone(event),
    ])),
    lockLog: [],
    sequence: events.length,
    queue: Promise.resolve(),
    async listOpenShipments(limit) {
      return [...adapter.shipments.values()]
        .filter((candidate) => !TERMINAL_STATES.has(candidate.status))
        .sort((left, right) => {
          const time = text(left.lastTrackingEventAt ?? left.createdAt)
            .localeCompare(text(right.lastTrackingEventAt ?? right.createdAt));
          return time || text(left.documentId).localeCompare(text(right.documentId));
        })
        .slice(0, limit)
        .map((candidate) => structuredClone(candidate));
    },
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const shipmentSnapshot = structuredClone([...adapter.shipments]);
      const eventSnapshot = structuredClone([...adapter.events]);
      const sequenceSnapshot = adapter.sequence;
      try {
        return await work({
          async lockShipmentByAwb(provider, awb) {
            const candidate = [...adapter.shipments.values()].find((item) =>
              item.provider === provider && item.awb === awb);
            if (!candidate) return null;
            adapter.lockLog.push(candidate.documentId);
            return structuredClone(candidate);
          },
          async findEventByProviderEventId(providerEventId) {
            const event = adapter.events.get(providerEventId);
            return event ? structuredClone(event) : null;
          },
          async updateShipment(documentId, data) {
            const candidate = adapter.shipments.get(documentId);
            if (!candidate) throw new Error("Shipment not found.");
            Object.assign(candidate, structuredClone(data));
            return structuredClone(candidate);
          },
          async createEvent(data) {
            if (adapter.events.has(data.providerEventId)) {
              throw new Error("Duplicate provider event.");
            }
            adapter.sequence += 1;
            const event = {
              documentId: `shipment-event-${adapter.sequence}`,
              ...structuredClone(data),
            };
            adapter.events.set(event.providerEventId, event);
            return structuredClone(event);
          },
        });
      } catch (error) {
        adapter.shipments = new Map(shipmentSnapshot);
        adapter.events = new Map(eventSnapshot);
        adapter.sequence = sequenceSnapshot;
        throw error;
      } finally {
        release();
      }
    },
  };
  return adapter;
}

function createStrapiTrackingAdapter(strapi) {
  const shipment = () => strapi.db.query("api::shipment.shipment");
  const shipmentEvent = () =>
    strapi.db.query("api::shipment-event.shipment-event");
  const options = (trx, extra = {}) => ({ ...extra, transacting: trx });
  return {
    listOpenShipments: (limit) => shipment().findMany({
      where: { status: { $notIn: [...TERMINAL_STATES] } },
      orderBy: [
        { lastTrackingEventAt: "asc" },
        { createdAt: "asc" },
      ],
      limit,
    }),
    transaction: (work) => strapi.db.transaction(async ({ trx }) => work({
      async lockShipmentByAwb(provider, awb) {
        const candidate = await shipment().findOne(options(trx, {
          where: { provider, awb },
        }));
        if (!candidate?.id) return null;
        await strapi.db.connection("shipments")
          .where({ id: candidate.id })
          .transacting(trx)
          .forUpdate()
          .first();
        return shipment().findOne(options(trx, {
          where: { id: candidate.id, provider, awb },
        }));
      },
      findEventByProviderEventId: (providerEventId) =>
        shipmentEvent().findOne(options(trx, {
          where: { providerEventId },
        })),
      updateShipment: (documentId, data) =>
        shipment().update(options(trx, {
          where: { documentId },
          data,
        })),
      createEvent: (data) => shipmentEvent().create(options(trx, { data })),
    })),
  };
}

async function runShippingTrackingStartupPoll(
  domain,
  logger,
  { enabled = process.env.SHIPPING_ENABLED, limit } = {},
) {
  if (enabled !== "true") return null;
  try {
    return await domain.pollOpenShipments({
      limit: pollLimit(
        limit ?? process.env.SHIPPING_TRACKING_STARTUP_POLL_LIMIT,
      ),
    });
  } catch (error) {
    logger?.warn?.("Shipping tracking startup poll failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

module.exports = {
  MAX_POLL_LIMIT,
  PROGRESS_STATES,
  TRACKING_STATES,
  applyTrackingEvent,
  createMemoryTrackingAdapter,
  createStrapiTrackingAdapter,
  createTrackingDomain,
  normaliseTrackingEvent,
  pollLimit,
  pollOpenShipments,
  publicTrackingProjection,
  runShippingTrackingStartupPoll,
  trackingTransition,
};
