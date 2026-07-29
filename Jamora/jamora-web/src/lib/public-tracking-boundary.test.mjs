import assert from "node:assert/strict";
import test from "node:test";

import trackingBoundary from "./public-tracking-boundary.cjs";
import publicTracking from "../../../jamora-strapi/src/api/analytics/services/public-order-tracking.cjs";

const {
  createPublicTrackingBrowserLimiter,
  trustedPublicTrackingHeaders,
} = trackingBoundary;
const {
  createPublicOrderTrackingLimiter,
  verifyPublicTrackingClientIdentity,
} = publicTracking;

const secret = "storefront-boundary-secret-at-least-32-bytes";
const accessA = `trk_${"A".repeat(43)}`;
const accessB = `trk_${"B".repeat(43)}`;
const now = new Date("2026-07-29T08:00:00.000Z");

function bffHeaders(ip, overrides = {}, env = { TRUST_PROXY: "true" }) {
  return trustedPublicTrackingHeaders(new Headers({
    "x-real-ip": ip,
    "x-jamora-tracking-client-key": "browser-forged-client",
    "x-jamora-tracking-client-timestamp": "1785311000",
    "x-jamora-tracking-client-signature": "browser-forged-signature",
    ...overrides,
  }), {
    env,
    secret,
    now,
  });
}

function strapiIdentity(headers) {
  return verifyPublicTrackingClientIdentity({
    headers,
    secret,
    now,
  });
}

test("BFF derives and signs isolated client identities while ignoring browser downstream headers", () => {
  const first = bffHeaders("198.51.100.10");
  const second = bffHeaders("198.51.100.11");
  const firstIdentity = strapiIdentity(first);
  const secondIdentity = strapiIdentity(second);

  assert.match(firstIdentity, /^[A-Za-z0-9_-]{43}$/);
  assert.match(secondIdentity, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(firstIdentity, secondIdentity);
  assert.notEqual(
    first.get("x-jamora-tracking-client-key"),
    "browser-forged-client",
  );

  const directA = strapiIdentity(bffHeaders(
    "198.51.100.10",
    {},
    { TRUST_PROXY: "false" },
  ));
  const directB = strapiIdentity(bffHeaders(
    "203.0.113.99",
    {},
    { TRUST_PROXY: "false" },
  ));
  assert.equal(directA, directB);
});

test("BFF-to-Strapi limiter isolates clients and valid capabilities from invalid spray", () => {
  const firstIdentity = strapiIdentity(bffHeaders("198.51.100.10"));
  const secondIdentity = strapiIdentity(bffHeaders("198.51.100.11"));
  const limiter = createPublicOrderTrackingLimiter({
    clientLimit: 2,
    capabilityLimit: 2,
    windowMs: 1_000,
    maxBuckets: 8,
    now: () => 0,
  });

  assert.equal(limiter.check(firstIdentity, "invalid-1").allowed, true);
  assert.equal(limiter.check(firstIdentity, "invalid-2").allowed, true);
  assert.equal(limiter.check(firstIdentity, "invalid-3").allowed, false);
  assert.equal(limiter.check(secondIdentity, accessB).allowed, true);
  assert.equal(limiter.check(secondIdentity, accessB).allowed, true);
  assert.equal(limiter.check(secondIdentity, accessB).allowed, false);
  assert.ok(limiter.bucketCount() <= 8);

  const otherCapabilityLimiter = createPublicOrderTrackingLimiter({
    clientLimit: 10,
    capabilityLimit: 1,
    now: () => 0,
  });
  assert.equal(
    otherCapabilityLimiter.check(firstIdentity, accessA).allowed,
    true,
  );
  assert.equal(
    otherCapabilityLimiter.check(firstIdentity, accessA).allowed,
    false,
  );
  assert.equal(
    otherCapabilityLimiter.check(firstIdentity, accessB).allowed,
    true,
  );
});

test("Strapi rejects forged, stale, or changed signed client identities", () => {
  const valid = bffHeaders("198.51.100.10");
  assert.equal(strapiIdentity(valid), valid.get("x-jamora-tracking-client-key"));

  for (const mutate of [
    (headers) => headers.set(
      "x-jamora-tracking-client-key",
      "A".repeat(43),
    ),
    (headers) => headers.set(
      "x-jamora-tracking-client-signature",
      "0".repeat(64),
    ),
    (headers) => headers.set(
      "x-jamora-tracking-client-timestamp",
      "1785311000",
    ),
  ]) {
    const forged = new Headers(valid);
    mutate(forged);
    assert.equal(strapiIdentity(forged), null);
  }
});

test("browser limiter prunes bounded client storage and degrades to one direct bucket", () => {
  let time = 0;
  const limiter = createPublicTrackingBrowserLimiter({
    limit: 2,
    windowMs: 1_000,
    maxBuckets: 3,
    now: () => time,
  });
  const trusted = { TRUST_PROXY: "true" };
  const direct = { TRUST_PROXY: "false" };

  assert.deepEqual(
    limiter.check(new Headers({ "x-real-ip": "198.51.100.1" }), trusted),
    { allowed: true },
  );
  assert.deepEqual(
    limiter.check(new Headers({ "x-real-ip": "198.51.100.1" }), trusted),
    { allowed: true },
  );
  assert.deepEqual(
    limiter.check(new Headers({ "x-real-ip": "198.51.100.1" }), trusted),
    { allowed: false, retryAfter: 1 },
  );
  for (let index = 2; index < 20; index += 1) {
    limiter.check(
      new Headers({ "x-real-ip": `198.51.100.${index}` }),
      trusted,
    );
  }
  assert.ok(limiter.bucketCount() <= 3);

  time = 1_001;
  assert.deepEqual(
    limiter.check(new Headers({ "x-real-ip": "198.51.100.2" }), direct),
    { allowed: true },
  );
  assert.deepEqual(
    limiter.check(new Headers({ "x-real-ip": "203.0.113.99" }), direct),
    { allowed: true },
  );
  assert.deepEqual(
    limiter.check(new Headers({ "x-real-ip": "192.0.2.44" }), direct),
    { allowed: false, retryAfter: 1 },
  );
});
