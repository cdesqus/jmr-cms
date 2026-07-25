"use strict";

const { createHash } = require("node:crypto");

const PROVIDER_PATHS = new Map([
  ["/api/jamora/payments/ropay/callback", "callback"],
  ["/api/jamora/internal/payments/ropay/status", "status"],
  ["/jamora/payments/ropay/callback", "callback"],
  ["/jamora/internal/payments/ropay/status", "status"],
]);
const JSON_CONTENT_TYPE =
  /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i;
const PROVIDER_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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

function createRoPayRequestLimiter(options = {}) {
  const limit = positiveInteger(options.limit, 60);
  const windowMs = positiveInteger(options.windowMs, 60_000);
  const maxBuckets = positiveInteger(options.maxBuckets, 10_000);
  const now = options.now ?? Date.now;
  const buckets = new Map();

  function consume(key) {
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
  }

  return {
    check(operation, ip) {
      return consume(`${operation}:ip:${opaqueKey(ip)}`);
    },
    bucketCount: () => buckets.size,
  };
}

function reject(ctx, status) {
  ctx.status = status;
  ctx.body = { error: "Request could not be completed." };
}

function createRoPayRequestGuard(options = {}) {
  const maxBytes = positiveInteger(options.maxBytes, 4_096);
  const limiter = options.limiter ?? createRoPayRequestLimiter(options);
  return async function ropayRequestGuard(ctx, next) {
    const normalizedPath = ctx.path.length > 1
      ? ctx.path.replace(/\/+$/, "")
      : ctx.path;
    const operation = PROVIDER_PATHS.get(normalizedPath);
    if (!operation) return next();

    const contentType = ctx.get("content-type");
    if (!JSON_CONTENT_TYPE.test(contentType)) {
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
    if (ctx.get("transfer-encoding") ||
        !/^[1-9]\d*$/.test(contentLength)) {
      reject(ctx, 411);
      return;
    }
    if (Number(contentLength) > maxBytes) {
      reject(ctx, 413);
      return;
    }
    const providerReference = ctx.get("x-ropay-provider-reference").trim();
    if (!PROVIDER_REFERENCE.test(providerReference)) {
      reject(ctx, 400);
      return;
    }
    const result = limiter.check(
      operation,
      ctx.ip ?? ctx.request?.ip,
    );
    if (!result.allowed) {
      ctx.set("Retry-After", String(result.retryAfter));
      reject(ctx, 429);
      return;
    }
    await next();
  };
}

function ropayRequestGuardFactory(config) {
  return createRoPayRequestGuard(config);
}

module.exports = {
  createRoPayRequestGuard,
  createRoPayRequestLimiter,
  ropayRequestGuardFactory,
};
