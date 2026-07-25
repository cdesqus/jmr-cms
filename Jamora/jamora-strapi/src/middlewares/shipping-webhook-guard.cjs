"use strict";

const {
  createHash,
  createHmac,
  timingSafeEqual,
} = require("node:crypto");

const WEBHOOK_PATHS = new Set([
  "/api/jamora/shipping/tracking/webhook",
  "/jamora/shipping/tracking/webhook",
]);
const JSON_CONTENT_TYPE =
  /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i;
const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SIGNATURE = /^sha256=([a-f0-9]{64})$/i;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function opaqueKey(value) {
  const normalized = typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : "<missing>";
  return createHash("sha256").update(normalized).digest("base64url");
}

function stableValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  throw new TypeError("Tracking webhook payload is invalid.");
}

function canonicalTrackingJson(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new TypeError("Tracking webhook payload is invalid.");
  }
  return JSON.stringify(stableValue(payload));
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(String(left), "utf8");
  const rightBytes = Buffer.from(String(right), "utf8");
  return leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes);
}

function webhookSecret(value) {
  const secret = typeof value === "string" ? value.trim() : "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new TypeError("Shipping webhook secret must be at least 32 bytes.");
  }
  return secret;
}

function signTrackingWebhook({ payload, timestamp, secret }) {
  const normalizedTimestamp = String(timestamp);
  if (!/^\d{10}$/.test(normalizedTimestamp)) {
    throw new TypeError("Tracking webhook timestamp is invalid.");
  }
  const digest = createHmac("sha256", webhookSecret(secret))
    .update(`${normalizedTimestamp}.${canonicalTrackingJson(payload)}`)
    .digest("hex");
  return `sha256=${digest}`;
}

function verifyTrackingWebhook({
  payload,
  providerHeader,
  timestamp,
  signature,
  secret,
  now = new Date(),
  toleranceSeconds = 300,
}) {
  const provider = typeof providerHeader === "string"
    ? providerHeader.trim()
    : "";
  const normalizedTimestamp = String(timestamp);
  const match = typeof signature === "string"
    ? SIGNATURE.exec(signature.trim())
    : null;
  if (!PROVIDER.test(provider) ||
      payload?.provider !== provider ||
      !/^\d{10}$/.test(normalizedTimestamp) ||
      !match) {
    throw new Error("Invalid webhook signature.");
  }
  const current = now instanceof Date ? now : new Date(now);
  const timestampMs = Number(normalizedTimestamp) * 1_000;
  if (!Number.isFinite(current.getTime()) ||
      Math.abs(current.getTime() - timestampMs) >
        positiveInteger(toleranceSeconds, 300) * 1_000) {
    throw new Error("Expired webhook signature.");
  }
  const expected = signTrackingWebhook({
    payload,
    timestamp: normalizedTimestamp,
    secret,
  });
  if (!safeEqual(signature.trim().toLowerCase(), expected.toLowerCase())) {
    throw new Error("Invalid webhook signature.");
  }
  return structuredClone(payload);
}

function createWindowLimiter({
  limit,
  windowMs,
  maxBuckets,
  now,
}) {
  const buckets = new Map();
  function consume(key, limitOverride) {
    const selectedLimit = positiveInteger(limitOverride, limit);
    const timestamp = now();
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
    if (current.count >= selectedLimit) {
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
  }
  return { consume, bucketCount: () => buckets.size };
}

function createShippingWebhookLimiter(options = {}) {
  const limiter = createWindowLimiter({
    limit: positiveInteger(options.limit, 60),
    windowMs: positiveInteger(options.windowMs, 60_000),
    maxBuckets: positiveInteger(options.maxBuckets, 10_000),
    now: options.now ?? Date.now,
  });
  return {
    check(ip) {
      return limiter.consume(`ip:${opaqueKey(ip)}`);
    },
    bucketCount: limiter.bucketCount,
  };
}

function createAuthenticatedTrackingLimiter(options = {}) {
  const providerLimit = positiveInteger(options.providerLimit, 1_000);
  const eventLimit = positiveInteger(options.eventLimit, 10);
  const limiter = createWindowLimiter({
    limit: Math.max(providerLimit, eventLimit),
    windowMs: positiveInteger(options.windowMs, 60_000),
    maxBuckets: positiveInteger(options.maxBuckets, 10_000),
    now: options.now ?? Date.now,
  });
  return {
    check(event) {
      const eventResult = limiter.consume(
        `event:${opaqueKey(event?.provider)}:${opaqueKey(event?.providerEventId)}`,
        eventLimit,
      );
      if (!eventResult.allowed) return eventResult;
      return limiter.consume(
        `provider:${opaqueKey(event?.provider)}`,
        providerLimit,
      );
    },
    bucketCount: limiter.bucketCount,
  };
}

function reject(ctx, status) {
  ctx.status = status;
  ctx.body = { error: "Request could not be completed." };
}

function createShippingWebhookGuard(options = {}) {
  const maxBytes = positiveInteger(options.maxBytes, 4_096);
  const limiter = options.limiter ?? createShippingWebhookLimiter(options);
  return async function shippingWebhookGuard(ctx, next) {
    const normalizedPath = ctx.path.length > 1
      ? ctx.path.replace(/\/+$/, "")
      : ctx.path;
    if (!WEBHOOK_PATHS.has(normalizedPath)) return next();
    if (ctx.method !== "POST") {
      reject(ctx, 405);
      return;
    }
    if (!JSON_CONTENT_TYPE.test(ctx.get("content-type"))) {
      reject(ctx, 415);
      return;
    }
    const contentEncoding = ctx.get("content-encoding");
    if (contentEncoding &&
        contentEncoding.trim().toLowerCase() !== "identity") {
      reject(ctx, 415);
      return;
    }
    const contentLength = ctx.get("content-length");
    if (ctx.get("transfer-encoding") || !/^[1-9]\d*$/.test(contentLength)) {
      reject(ctx, 411);
      return;
    }
    if (Number(contentLength) > maxBytes) {
      reject(ctx, 413);
      return;
    }
    if (!PROVIDER.test(ctx.get("x-jamora-shipping-provider").trim())) {
      reject(ctx, 400);
      return;
    }
    const limited = limiter.check(ctx.ip ?? ctx.request?.ip);
    if (!limited.allowed) {
      ctx.set("Retry-After", String(limited.retryAfter));
      reject(ctx, 429);
      return;
    }
    await next();
  };
}

function shippingWebhookGuardFactory(config) {
  return createShippingWebhookGuard(config);
}

module.exports = {
  canonicalTrackingJson,
  createAuthenticatedTrackingLimiter,
  createShippingWebhookGuard,
  createShippingWebhookLimiter,
  shippingWebhookGuardFactory,
  signTrackingWebhook,
  verifyTrackingWebhook,
};
