"use strict";

const { createHash } = require("node:crypto");

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function opaqueKey(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : "")
    .digest("base64url");
}

function createRoPayAuthenticatedLimiter(options = {}) {
  const limit = positiveInteger(options.limit, 60);
  const replayLimit = positiveInteger(options.replayLimit, 120);
  const windowMs = positiveInteger(options.windowMs, 60_000);
  const maxBuckets = positiveInteger(options.maxBuckets, 10_000);
  const now = options.now ?? Date.now;
  const buckets = new Map();

  function retryAfter(bucket, timestamp) {
    return Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1_000));
  }

  function createBucket(key, timestamp) {
    if (buckets.size >= maxBuckets) {
      for (const [candidate, bucket] of buckets) {
        if (timestamp >= bucket.resetAt) buckets.delete(candidate);
      }
      while (buckets.size >= maxBuckets) {
        buckets.delete(buckets.keys().next().value);
      }
    }
    const bucket = {
      resetAt: timestamp + windowMs,
      events: new Map(),
    };
    buckets.set(key, bucket);
    return bucket;
  }

  return {
    check(providerEvent) {
      const timestamp = Number(now());
      const providerKey = opaqueKey(providerEvent.providerReference);
      let bucket = buckets.get(providerKey);
      if (bucket && timestamp >= bucket.resetAt) {
        buckets.delete(providerKey);
        bucket = undefined;
      }
      bucket ??= createBucket(providerKey, timestamp);

      const eventKey = opaqueKey(providerEvent.providerEventId);
      const fingerprint = opaqueKey(JSON.stringify(providerEvent));
      const existing = bucket.events.get(eventKey);
      if (existing) {
        if (existing.count >= replayLimit) {
          return {
            allowed: false,
            retryAfter: retryAfter(bucket, timestamp),
          };
        }
        existing.count += 1;
        return {
          allowed: true,
          replay: existing.fingerprint === fingerprint,
        };
      }
      if (bucket.events.size >= limit) {
        return {
          allowed: false,
          retryAfter: retryAfter(bucket, timestamp),
        };
      }
      bucket.events.set(eventKey, { count: 1, fingerprint });
      return { allowed: true, replay: false };
    },
    bucketCount: () => buckets.size,
    eventCount: () => {
      let count = 0;
      for (const bucket of buckets.values()) count += bucket.events.size;
      return count;
    },
  };
}

module.exports = {
  createRoPayAuthenticatedLimiter,
};
