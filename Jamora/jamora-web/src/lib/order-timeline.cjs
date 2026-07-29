"use strict";

const ORDER_STATUSES = new Set([
  "pending",
  "paid",
  "processing",
  "shipped",
  "fulfilled",
  "failed",
  "refunded",
]);

function text(value, maximum) {
  if (typeof value !== "string") return "";
  const result = value.trim();
  return result.length <= maximum ? result : result.slice(0, maximum);
}

function safeIso(value, fallback) {
  for (const candidate of [value, fallback, "1970-01-01T00:00:00.000Z"]) {
    if (typeof candidate === "string" && Number.isFinite(new Date(candidate).getTime())) {
      return new Date(candidate).toISOString();
    }
  }
}

function normalizeOrderTimeline(value, fallbackCreatedAt) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((event, index) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) return [];
    const status = text(event.status, 40).toLowerCase();
    const note = text(event.note, 1_000);
    const type = ORDER_STATUSES.has(status) ? "status" : "note";
    if (type === "note" && !note) return [];
    const id = text(event.id, 200) || `evt-order-${index}`;
    return [{
      id,
      type,
      ...(type === "status" ? { status } : {}),
      createdAt: safeIso(event.createdAt, fallbackCreatedAt),
      ...(note ? { note } : {}),
    }];
  });
}

module.exports = { normalizeOrderTimeline };
