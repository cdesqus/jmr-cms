"use strict";

const TRACKING_STATES = new Set([
  "label_created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "returned",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeTrackingStatus(value) {
  const status = text(value).toLowerCase();
  return TRACKING_STATES.has(status) ? status : undefined;
}

function trackingFields(order) {
  const shipment = order?.shipment;
  const projectedNumber = text(shipment?.trackingNumber);
  if (shipment && projectedNumber) {
    return {
      carrier: text(shipment.carrier),
      service: text(shipment.service) || undefined,
      trackingNumber: projectedNumber,
      shipmentStatus: safeTrackingStatus(shipment.status),
    };
  }
  return {
    carrier: text(order?.carrier) || "Jamora EU Fulfilment",
    service: undefined,
    trackingNumber: text(order?.trackingNumber),
    shipmentStatus: undefined,
  };
}

function trackingTimeline(order) {
  const history = Array.isArray(order?.statusHistory)
    ? structuredClone(order.statusHistory)
    : [];
  const updates = Array.isArray(order?.shipment?.updates)
    ? order.shipment.updates
    : [];
  const seen = new Set(history.map((event) => event?.id).filter(Boolean));
  for (const update of updates) {
    const status = safeTrackingStatus(update?.status);
    const occurredAt = text(update?.occurredAt);
    const parsed = new Date(occurredAt);
    if (!status || !Number.isFinite(parsed.getTime())) continue;
    const createdAt = parsed.toISOString();
    const id = `tracking-${encodeURIComponent(createdAt)}-${status}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const label = status.replaceAll("_", " ");
    history.push({
      id,
      type: "note",
      note: `Shipment update: ${label.charAt(0).toUpperCase()}${label.slice(1)}`,
      actor: "Carrier",
      createdAt,
    });
  }
  return history.sort((left, right) =>
    text(left?.createdAt).localeCompare(text(right?.createdAt)));
}

module.exports = {
  trackingFields,
  trackingTimeline,
};
