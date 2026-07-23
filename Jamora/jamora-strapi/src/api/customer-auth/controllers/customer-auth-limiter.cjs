"use strict";
const { createHash } = require("node:crypto");

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalized = (value) =>
  typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : "<missing>";
const opaqueKey = (value) =>
  createHash("sha256").update(normalized(value)).digest("base64url");

function createCustomerAuthLimiter(options = {}) {
  const limit = positiveInteger(options.limit, 8);
  const windowMs = positiveInteger(options.windowMs, 60_000);
  const maxBuckets = positiveInteger(options.maxBuckets, 10_000);
  const now = options.now ?? Date.now;
  const buckets = new Map();

  const consume = (key) => {
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
        retryAfter: Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000)),
      };
    }
    current.count += 1;
    return { allowed: true };
  };

  const check = (operation, ip, account) => {
    const ipResult = consume(`${operation}:ip:${opaqueKey(ip)}`);
    if (!ipResult.allowed) return ipResult;
    return consume(`${operation}:account:${opaqueKey(account)}`);
  };

  return {
    check,
    bucketCount: () => buckets.size,
    guard(ctx, operation) {
      const input = ctx.request?.body ?? {};
      const account = input.email ?? input.documentId ?? input.token;
      const result = check(operation, ctx.ip ?? ctx.request?.ip, account);
      if (result.allowed) return true;
      ctx.set("Retry-After", String(result.retryAfter));
      ctx.status = 429;
      ctx.body = operation === "forgot-password"
        ? { accepted: true }
        : { error: "Request could not be completed." };
      return false;
    },
  };
}

const customerAuthLimiter = createCustomerAuthLimiter({
  limit: process.env.CUSTOMER_AUTH_RATE_LIMIT,
  windowMs: process.env.CUSTOMER_AUTH_RATE_WINDOW_MS,
  maxBuckets: process.env.CUSTOMER_AUTH_RATE_MAX_BUCKETS,
});

module.exports = { createCustomerAuthLimiter, customerAuthLimiter };
