"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash, createHmac } = require("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isIP } = require("node:net");

const CLIENT_KEY_HEADER = "x-jamora-tracking-client-key";
const CLIENT_TIMESTAMP_HEADER = "x-jamora-tracking-client-timestamp";
const CLIENT_SIGNATURE_HEADER = "x-jamora-tracking-client-signature";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getHeader(headers, name) {
  if (typeof headers?.get === "function") return text(headers.get(name));
  const target = name.toLowerCase();
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === target,
  );
  return text(entry?.[1]);
}

function boundarySecret(value) {
  const secret = text(value);
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Public tracking boundary secret is unavailable.");
  }
  return secret;
}

function derivePublicTrackingClientKey(headers, env = process.env) {
  let source = "direct";
  if (env?.TRUST_PROXY === "true") {
    const trustedProxyIp = getHeader(headers, "x-real-ip");
    if (isIP(trustedProxyIp)) source = `proxy:${trustedProxyIp.toLowerCase()}`;
  }
  return createHash("sha256").update(source, "utf8").digest("base64url");
}

function createPublicTrackingBrowserLimiter(options = {}) {
  const limit = positiveInteger(options.limit, 30);
  const windowMs = positiveInteger(options.windowMs, 60_000);
  const maxBuckets = positiveInteger(options.maxBuckets, 10_000);
  const now = options.now ?? Date.now;
  const buckets = new Map();
  return {
    check(headers, env = process.env) {
      const timestamp = now();
      const key = derivePublicTrackingClientKey(headers, env);
      const current = buckets.get(key);
      if (!current || timestamp >= current.resetAt) {
        if (!current && buckets.size >= maxBuckets) {
          for (const [candidate, bucket] of buckets) {
            if (timestamp >= bucket.resetAt) buckets.delete(candidate);
          }
          while (buckets.size >= maxBuckets) {
            buckets.delete(buckets.keys().next().value);
          }
        }
        buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
        return { allowed: true };
      }
      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfter: Math.max(
            1,
            Math.ceil((current.resetAt - timestamp) / 1_000),
          ),
        };
      }
      current.count += 1;
      return { allowed: true };
    },
    bucketCount: () => buckets.size,
  };
}

function trackingClientSignature({ clientKey, timestamp, secret }) {
  return createHmac("sha256", boundarySecret(secret))
    .update(`public-tracking\0${timestamp}\0${clientKey}`)
    .digest("hex");
}

function trustedPublicTrackingHeaders(
  inputHeaders,
  {
    env = process.env,
    secret,
    now = new Date(),
  } = {},
) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) {
    throw new TypeError("Public tracking boundary time is invalid.");
  }
  const clientKey = derivePublicTrackingClientKey(inputHeaders, env);
  const timestamp = String(Math.floor(current.getTime() / 1_000));
  const headers = new Headers();
  headers.set(CLIENT_KEY_HEADER, clientKey);
  headers.set(CLIENT_TIMESTAMP_HEADER, timestamp);
  headers.set(CLIENT_SIGNATURE_HEADER, trackingClientSignature({
    clientKey,
    timestamp,
    secret,
  }));
  return headers;
}

module.exports = {
  CLIENT_KEY_HEADER,
  CLIENT_SIGNATURE_HEADER,
  CLIENT_TIMESTAMP_HEADER,
  createPublicTrackingBrowserLimiter,
  derivePublicTrackingClientKey,
  trackingClientSignature,
  trustedPublicTrackingHeaders,
};
