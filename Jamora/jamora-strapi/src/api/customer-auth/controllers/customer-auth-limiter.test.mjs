import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerAuthLimiter } from "./customer-auth-limiter.cjs";

test("allows requests up to the configured limit then blocks with retry-after", () => {
  let now = 1_000;
  const limiter = createCustomerAuthLimiter({ limit: 2, windowMs: 1_000, now: () => now });
  assert.equal(limiter.check("login", "192.0.2.1", " User@Example.COM ").allowed, true);
  assert.equal(limiter.check("login", "192.0.2.1", "user@example.com").allowed, true);
  assert.deepEqual(limiter.check("login", "192.0.2.1", "user@example.com"), {
    allowed: false,
    retryAfter: 1,
  });
  now = 2_001;
  assert.equal(limiter.check("login", "192.0.2.1", "user@example.com").allowed, true);
});

test("separates account and IP buckets and blocks either abusive dimension", () => {
  const limiter = createCustomerAuthLimiter({ limit: 2, windowMs: 60_000, now: () => 0 });
  assert.equal(limiter.check("login", "192.0.2.1", "a@example.com").allowed, true);
  assert.equal(limiter.check("login", "192.0.2.2", "a@example.com").allowed, true);
  assert.equal(limiter.check("login", "192.0.2.3", "a@example.com").allowed, false);

  const second = createCustomerAuthLimiter({ limit: 2, windowMs: 60_000, now: () => 0 });
  assert.equal(second.check("login", "192.0.2.1", "a@example.com").allowed, true);
  assert.equal(second.check("login", "192.0.2.1", "b@example.com").allowed, true);
  assert.equal(second.check("login", "192.0.2.1", "c@example.com").allowed, false);
});

test("controller integration emits generic 429 and Retry-After", () => {
  const limiter = createCustomerAuthLimiter({ limit: 1, windowMs: 2_000, now: () => 0 });
  const ctx = {
    ip: "192.0.2.10",
    request: { body: { email: "person@example.com" } },
    set(name, value) { this.headers = { [name]: value }; },
  };
  assert.equal(limiter.guard(ctx, "forgot-password"), true);
  assert.equal(limiter.guard(ctx, "forgot-password"), false);
  assert.equal(ctx.status, 429);
  assert.deepEqual(ctx.body, { accepted: true });
  assert.deepEqual(ctx.headers, { "Retry-After": "2" });
});

test("bounds in-memory buckets under high-cardinality abuse", () => {
  const limiter = createCustomerAuthLimiter({
    limit: 2,
    windowMs: 60_000,
    maxBuckets: 4,
    now: () => 0,
  });
  for (let index = 0; index < 10; index += 1) {
    limiter.check("login", `192.0.2.${index}`, `user-${index}@example.com`);
  }
  assert.ok(limiter.bucketCount() <= 4);
});

test("many distinct trusted storefront customers do not share a container IP bucket", () => {
  const limiter = createCustomerAuthLimiter({ limit: 2, windowMs: 60_000, now: () => 0 });
  for (let index = 0; index < 20; index += 1) {
    assert.equal(limiter.checkTrusted("login", `user-${index}@example.com`).allowed, true);
  }
});

test("direct callers still consume IP and account buckets", () => {
  const limiter = createCustomerAuthLimiter({ limit: 2, windowMs: 60_000, now: () => 0 });
  assert.equal(limiter.check("login", "198.51.100.1", "a@example.com").allowed, true);
  assert.equal(limiter.check("login", "198.51.100.1", "b@example.com").allowed, true);
  assert.equal(limiter.check("login", "198.51.100.1", "c@example.com").allowed, false);
});
