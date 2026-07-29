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

function trackingSurfacePolicy(mode) {
  const publicTracking = mode === "tracking";
  return {
    showCustomer: !publicTracking,
    showItems: !publicTracking,
    showPrices: !publicTracking,
  };
}

function publicTrackingSearchParams(query, access) {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  const normalizedAccess = typeof access === "string" ? access.trim() : "";
  if (!normalizedQuery ||
      normalizedQuery.length > 255 ||
      !/^trk_[A-Za-z0-9_-]{43}$/.test(normalizedAccess)) {
    return null;
  }
  return new URLSearchParams({
    q: normalizedQuery,
    access: normalizedAccess,
  }).toString();
}

function parsePublicTrackingInput(value, fallbackAccess) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input) return null;
  let query = input;
  let access = fallbackAccess;
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol) ||
        url.pathname.replace(/\/+$/, "") !== "/track") {
      return null;
    }
    query = url.searchParams.get("order") ?? "";
    access = url.searchParams.get("access") ?? "";
  } catch {}
  if (!publicTrackingSearchParams(query, access)) return null;
  return { query: query.trim(), access: access.trim() };
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
  parsePublicTrackingInput,
  publicTrackingSearchParams,
  trackingFields,
  trackingSurfacePolicy,
  trackingTimeline,
};
