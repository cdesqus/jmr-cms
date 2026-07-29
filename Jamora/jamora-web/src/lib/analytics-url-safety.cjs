"use strict";

const REDACTED = "[REDACTED]";
const SECRET_VALUE =
  /\b(?:trk_[A-Za-z0-9_-]{43}|rsv_[A-Za-z0-9_-]{20,}|mco_[A-Za-z0-9_-]{20,})\b/g;
const SECRET_PARAMETER =
  /^(?:access|token|capability|authorization|reservationToken|checkoutReference|api[-_]?key)$/i;

function boundedText(value, maximum) {
  return (typeof value === "string" ? value : "").slice(0, maximum);
}

function redactSecrets(value) {
  return String(value ?? "").replace(SECRET_VALUE, REDACTED);
}

function sanitizeAnalyticsLocation(value, maximum = 1_000) {
  const raw = boundedText(value, 8_192);
  if (!raw) return "";
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  try {
    const parsed = new URL(raw, "https://analytics.invalid");
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    parsed.pathname = redactSecrets(parsed.pathname);
    for (const [key, current] of [...parsed.searchParams.entries()]) {
      parsed.searchParams.set(
        key,
        SECRET_PARAMETER.test(key) ? REDACTED : redactSecrets(current),
      );
    }
    const safe = absolute
      ? `${parsed.origin}${parsed.pathname}${parsed.search}`
      : `${parsed.pathname}${parsed.search}`;
    return safe.slice(0, maximum);
  } catch {
    return redactSecrets(raw).slice(0, maximum);
  }
}

function sanitizeVisitPayload(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    visitorId: redactSecrets(boundedText(input.visitorId, 120)),
    path: sanitizeAnalyticsLocation(input.path || "/", 500) || "/",
    referrer: sanitizeAnalyticsLocation(input.referrer, 1_000),
    userAgent: redactSecrets(boundedText(input.userAgent, 1_000)),
  };
}

module.exports = {
  redactSecrets,
  sanitizeAnalyticsLocation,
  sanitizeVisitPayload,
};
