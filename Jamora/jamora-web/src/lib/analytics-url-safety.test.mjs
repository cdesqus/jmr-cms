import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeAnalyticsLocation,
  sanitizeVisitPayload,
} from "./analytics-url-safety.cjs";

const CAPABILITY = `trk_${"A".repeat(43)}`;

test("analytics locations preserve useful attribution without bearer values", () => {
  assert.equal(
    sanitizeAnalyticsLocation(
      `/track?utm_source=newsletter&access=${CAPABILITY}&campaign=spring`,
      500,
    ),
    "/track?utm_source=newsletter&access=%5BREDACTED%5D&campaign=spring",
  );
  assert.equal(
    sanitizeAnalyticsLocation(
      `https://example.test/track?q=${CAPABILITY}&token=secret#private`,
      1_000,
    ),
    "https://example.test/track?q=%5BREDACTED%5D&token=%5BREDACTED%5D",
  );
  assert.doesNotMatch(
    sanitizeAnalyticsLocation(`/forward/${CAPABILITY}?utm_source=safe`),
    /trk_/,
  );
});

test("visit payload sanitizer bounds attacker-controlled browser fields", () => {
  const payload = sanitizeVisitPayload({
    visitorId: "v".repeat(500),
    path: `/track?access=${CAPABILITY}`,
    referrer: `https://search.test/?next=${CAPABILITY}`,
    userAgent: "u".repeat(2_000),
  });

  assert.equal(payload.visitorId.length, 120);
  assert.equal(payload.userAgent.length, 1_000);
  assert.doesNotMatch(JSON.stringify(payload), /trk_/);
  assert.match(payload.path, /\[REDACTED\]|%5BREDACTED%5D/);
});
