# RoPay Authenticated Rate-Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unauthenticated requests from consuming attacker-selected RoPay provider-reference capacity while bounding authenticated provider events and exact retries after HMAC verification.

**Architecture:** The pre-body middleware retains strict framing/header validation and a bounded per-operation IP limiter, but it never keys state by the untrusted provider-reference header. A new service-local authenticated limiter runs in `handleRoPayCallback` only after signature and header/payload verification; it bounds distinct event IDs per provider reference and exact/changed retries per event while sharing identity across callback and status transports.

**Tech Stack:** Strapi 5, TypeScript service/controller wrappers, CommonJS runtime services, Node `node:test`, SHA-256 opaque in-memory keys.

## Global Constraints

- Preserve strict JSON, explicit `Content-Length`, 4096-byte maximum, encoding, header syntax, and trailing-slash pre-body protections.
- Invalid signatures and header/payload mismatches must not create or consume provider/event limiter state.
- Storage must be explicitly bounded.
- Exact cross-channel event retries must retain the existing database idempotency behavior.
- Use TDD: observe the regression tests fail before production edits.

---

### Task 1: Restrict the pre-auth limiter to IP identity

**Files:**
- Modify: `Jamora/jamora-strapi/src/middlewares/ropay-request-guard.test.mjs`
- Modify: `Jamora/jamora-strapi/src/middlewares/ropay-request-guard.cjs`

**Interfaces:**
- Consumes: `createRoPayRequestLimiter({ limit, windowMs, maxBuckets, now })`
- Produces: `limiter.check(operation, ip)` with one bounded bucket per operation/IP, independent of the untrusted provider-reference header.

- [x] **Step 1: Write the failing test**

Replace the provider-reference dimension assertion with:

```js
test("pre-auth rate limiting uses only operation and IP identity", () => {
  const limiter = createRoPayRequestLimiter({
    limit: 1,
    windowMs: 60_000,
    now: () => 0,
  });
  assert.equal(limiter.check("callback", "192.0.2.1", "RPI-1").allowed, true);
  assert.equal(limiter.check("callback", "192.0.2.2", "RPI-1").allowed, true);
  assert.equal(limiter.bucketCount(), 2);
  assert.equal(limiter.check("callback", "192.0.2.1", "ATTACKER").allowed, false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test src/middlewares/ropay-request-guard.test.mjs`

Expected: FAIL because the second IP is blocked by the shared attacker-selected provider-reference bucket and/or the bucket count exceeds two.

- [x] **Step 3: Write minimal implementation**

Change the limiter to:

```js
check(operation, ip) {
  return consume(`${operation}:ip:${opaqueKey(ip)}`);
}
```

Call it from the guard as `limiter.check(operation, ctx.ip ?? ctx.request?.ip)`. Keep provider-reference syntax validation but never use the value as a pre-auth storage key.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test src/middlewares/ropay-request-guard.test.mjs`

Expected: 8 tests passed, 0 failed.

### Task 2: Add bounded post-HMAC provider/event limiting

**Files:**
- Create: `Jamora/jamora-strapi/src/api/payment-operations/services/ropay-authenticated-limiter.cjs`
- Create: `Jamora/jamora-strapi/src/api/payment-operations/services/ropay-authenticated-limiter.test.mjs`
- Modify: `Jamora/jamora-strapi/src/api/payment-operations/services/ropay-adapter.cjs`
- Modify: `Jamora/jamora-strapi/src/api/payment-operations/services/ropay-adapter.test.mjs`
- Modify: `Jamora/jamora-strapi/src/api/payment-operations/services/payment-operations.ts`
- Modify: `Jamora/jamora-strapi/src/api/payment-operations/controllers/payment-operations.ts`
- Modify: `Jamora/jamora-strapi/src/api/payment-operations/controllers/payment-operations.test.mjs`

**Interfaces:**
- Produces: `createRoPayAuthenticatedLimiter({ limit, replayLimit, windowMs, maxBuckets, now })`.
- Produces: `limiter.check(verifiedPayload)` returning `{ allowed, retryAfter?, replay? }`.
- Consumes: canonical verified fields `providerReference`, `providerEventId`, and the full canonical payload fingerprint.
- `handleRoPayCallback(..., { authenticatedLimiter })` invokes `check` after successful HMAC/header verification and before opening a database transaction.

- [x] **Step 1: Write failing limiter and adapter tests**

Test the wished-for limiter API with one provider-reference bucket, distinct-event limit one, retry limit two, a second exact cross-channel retry allowed, a third exact retry denied, a distinct event denied, and `bucketCount() <= maxBuckets`.

Add an adapter regression that:

```js
const limiter = createRoPayAuthenticatedLimiter({
  limit: 1,
  replayLimit: 3,
  maxBuckets: 2,
  now: () => 0,
});
const invalid = { ...signedRequest(), signature: "sha256=" + "0".repeat(64) };
await assert.rejects(
  () => handleRoPayCallback(adapter, invalid, {
    env: enabled,
    now: () => now,
    authenticatedLimiter: limiter,
  }),
  /signature verification failed/i,
);
assert.equal(limiter.bucketCount(), 0);
const first = await handleRoPayCallback(adapter, signedRequest(), options);
const replay = await handleRoPayCallback(
  adapter,
  signedRequest(payload(), "status"),
  { ...options, verification: "status" },
);
assert.equal(first.idempotent, false);
assert.equal(replay.idempotent, true);
```

Then submit a newly signed `event-2` for the same provider reference and expect an authenticated rate-limit error with status `429`.

- [x] **Step 2: Run tests to verify RED**

Run:

`node --test src/api/payment-operations/services/ropay-authenticated-limiter.test.mjs src/api/payment-operations/services/ropay-adapter.test.mjs`

Expected: FAIL because the authenticated limiter module/API does not exist and the adapter does not enforce it.

- [x] **Step 3: Implement the bounded limiter**

Use a `Map` keyed by SHA-256 of normalized provider reference. Each active reference bucket stores at most `limit` SHA-256 event keys, and each event record stores only its SHA-256 canonical-payload fingerprint and a counter capped by `replayLimit`. Expire buckets by `windowMs`; when `maxBuckets` is reached, delete expired entries then the oldest entries until bounded.

Exact fingerprints increment the event retry counter without consuming distinct-event capacity. Changed payloads for the same event ID share the same retry counter so the first conflict still reaches the database idempotency check. Return generic `{ allowed: false, retryAfter }` when either bound is exceeded.

- [x] **Step 4: Integrate after verification**

In `handleRoPayCallback`, call the injected limiter immediately after `verifyRoPayCallback`/`verifyRoPayStatus`. Throw a typed error carrying `statusCode = 429` and `retryAfter` when blocked. Do not call the limiter from `verifySignedPayload` or before it.

Instantiate one limiter in the Strapi payment service factory using:

```ts
const ropayAuthenticatedLimiter = createRoPayAuthenticatedLimiter({
  limit: process.env.ROPAY_AUTH_RATE_LIMIT,
  replayLimit: process.env.ROPAY_AUTH_REPLAY_LIMIT,
  windowMs: process.env.ROPAY_AUTH_RATE_WINDOW_MS,
  maxBuckets: process.env.ROPAY_AUTH_RATE_MAX_BUCKETS,
});
```

Pass it to callback and signed status handling. Update the controller error mapper to emit generic `429` plus `Retry-After`.

- [x] **Step 5: Run focused tests to verify GREEN**

Run:

`node --test src/api/payment-operations/services/ropay-authenticated-limiter.test.mjs src/api/payment-operations/services/ropay-adapter.test.mjs src/api/payment-operations/controllers/payment-operations.test.mjs src/middlewares/ropay-request-guard.test.mjs`

Expected: all selected tests pass with zero failures.

### Task 3: Verify, report, and commit

**Files:**
- Modify: `.superpowers/sdd/phase2-task3-report.md`

**Interfaces:**
- Consumes: completed source/test changes.
- Produces: reproducible RED/GREEN and final verification evidence.

- [x] **Step 1: Run final focused suite**

Run:

`node --test src/api/payment-operations/services/*.test.mjs src/api/payment-operations/controllers/*.test.mjs src/api/payment/content-types/payment/*.test.mjs src/api/payment-event/content-types/payment-event/*.test.mjs src/middlewares/*.test.mjs`

- [x] **Step 2: Run full suite and build**

Run `node --test`, then `npm run build`, then smoke-load the compiled authenticated limiter and confirm the compiled middleware remains before `strapi::body`.

- [x] **Step 3: Restore generated artifacts**

Verify the resolved absolute `Jamora/jamora-strapi/dist` path, restore tracked `dist` and `.strapi-updater.json`, then remove only untracked files under that exact `dist` path.

- [x] **Step 4: Update report and commit**

Append the rate-limit threat model, RED/GREEN evidence, counts, process-local/proxy caveats, and build evidence to `.superpowers/sdd/phase2-task3-report.md`.

Run `git diff --check`, stage only intended files, inspect `git diff --cached`, and commit:

`fix: isolate authenticated ropay rate limits`
