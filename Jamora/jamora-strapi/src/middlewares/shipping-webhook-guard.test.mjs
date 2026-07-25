import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import middlewares from "../../config/middlewares.ts";
import guardModule from "./shipping-webhook-guard.cjs";

const {
  canonicalTrackingJson,
  createAuthenticatedTrackingLimiter,
  createShippingWebhookGuard,
  signTrackingWebhook,
  verifyTrackingWebhook,
} = guardModule;

const payload = {
  providerEventId: "evt-1",
  provider: "jamora-mock",
  awb: "JMR000000000000000001",
  status: "in_transit",
  occurredAt: "2026-07-25T12:00:00.000Z",
};

function context(headers = {}, path = "/api/jamora/shipping/tracking/webhook") {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  let bodyReads = 0;
  const request = { ip: "192.0.2.1" };
  Object.defineProperty(request, "body", {
    get() {
      bodyReads += 1;
      throw new Error("body read before body middleware");
    },
  });
  return {
    ctx: {
      path,
      method: "POST",
      ip: "192.0.2.1",
      request,
      status: 200,
      get(name) {
        return normalized[name.toLowerCase()] ?? "";
      },
      set(name, value) {
        this.responseHeaders = {
          ...(this.responseHeaders ?? {}),
          [name]: value,
        };
      },
    },
    bodyReads: () => bodyReads,
  };
}

const validHeaders = {
  "content-type": "application/json",
  "content-length": "512",
  "x-jamora-shipping-provider": "jamora-mock",
};

test("shipping webhook guard is configured before Strapi body parsing", () => {
  const guardIndex = middlewares.findIndex(
    (entry) => typeof entry === "object" &&
      entry.name === "global::shipping-webhook-guard",
  );
  assert.ok(guardIndex >= 0);
  assert.ok(guardIndex < middlewares.indexOf("strapi::body"));
});

test("pre-body guard enforces JSON, explicit size, identity encoding, provider, and IP limit", async () => {
  const guard = createShippingWebhookGuard({ limit: 1, windowMs: 2_000 });
  const valid = context(validHeaders);
  let nextCalls = 0;
  await guard(valid.ctx, async () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(valid.bodyReads(), 0);

  const blocked = context(validHeaders);
  await guard(blocked.ctx, async () => assert.fail("must be rate limited"));
  assert.equal(blocked.ctx.status, 429);
  assert.deepEqual(blocked.ctx.responseHeaders, { "Retry-After": "2" });
  assert.equal(blocked.bodyReads(), 0);

  for (const [headers, status] of [
    [{ ...validHeaders, "content-type": "multipart/form-data" }, 415],
    [{ ...validHeaders, "content-length": "" }, 411],
    [{ ...validHeaders, "transfer-encoding": "chunked" }, 411],
    [{ ...validHeaders, "content-length": "4097" }, 413],
    [{ ...validHeaders, "content-encoding": "gzip" }, 415],
    [{ ...validHeaders, "x-jamora-shipping-provider": "bad provider" }, 400],
  ]) {
    const request = context(headers);
    await createShippingWebhookGuard({ limit: 10 })(
      request.ctx,
      async () => assert.fail("invalid request must not proceed"),
    );
    assert.equal(request.ctx.status, status);
    assert.equal(request.bodyReads(), 0);
  }
});

test("canonical JSON is stable across object key order and HMAC authenticates timestamp plus payload", () => {
  const reordered = {
    occurredAt: payload.occurredAt,
    status: payload.status,
    awb: payload.awb,
    provider: payload.provider,
    providerEventId: payload.providerEventId,
  };
  const secret = "shipping-webhook-secret-at-least-32-bytes";
  const timestamp = "1784980800";
  assert.equal(canonicalTrackingJson(payload), canonicalTrackingJson(reordered));

  const signature = signTrackingWebhook({ payload, timestamp, secret });
  assert.equal(
    signature,
    `sha256=${createHmac("sha256", secret)
      .update(`${timestamp}.${canonicalTrackingJson(payload)}`)
      .digest("hex")}`,
  );
  assert.deepEqual(verifyTrackingWebhook({
    payload: reordered,
    providerHeader: "jamora-mock",
    timestamp,
    signature,
    secret,
    now: new Date("2026-07-25T12:00:30.000Z"),
  }), payload);
  assert.throws(() => verifyTrackingWebhook({
    payload,
    providerHeader: "jamora-mock",
    timestamp,
    signature: `${signature.slice(0, -1)}0`,
    secret,
    now: new Date("2026-07-25T12:00:30.000Z"),
  }), /invalid webhook signature/i);
  assert.throws(() => verifyTrackingWebhook({
    payload,
    providerHeader: "foreign-provider",
    timestamp,
    signature,
    secret,
    now: new Date("2026-07-25T12:00:30.000Z"),
  }), /invalid webhook signature/i);
  assert.throws(() => verifyTrackingWebhook({
    payload,
    providerHeader: "jamora-mock",
    timestamp,
    signature,
    secret,
    now: new Date("2026-07-25T12:10:01.000Z"),
  }), /expired webhook signature/i);
});

test("authenticated limiter is provider-bound, event-aware, and bounded", () => {
  const limiter = createAuthenticatedTrackingLimiter({
    providerLimit: 3,
    eventLimit: 2,
    maxBuckets: 4,
    now: () => 0,
  });
  assert.equal(limiter.check(payload).allowed, true);
  assert.equal(limiter.check(payload).allowed, true);
  assert.equal(limiter.check(payload).allowed, false);
  assert.equal(limiter.check({ ...payload, providerEventId: "evt-2" }).allowed, true);
  assert.equal(
    limiter.check({ ...payload, providerEventId: "evt-3" }).allowed,
    false,
  );
  assert.ok(limiter.bucketCount() <= 4);

  const flooded = createAuthenticatedTrackingLimiter({
    providerLimit: 100,
    eventLimit: 100,
    maxBuckets: 4,
    now: () => 0,
  });
  for (let index = 0; index < 20; index += 1) {
    flooded.check({
      ...payload,
      provider: `provider-${index}`,
      providerEventId: `event-${index}`,
    });
  }
  assert.ok(flooded.bucketCount() <= 4);
});

test("non-webhook paths pass through without provider metadata", async () => {
  const request = context({}, "/api/jamora/shipping/quotes");
  let nextCalls = 0;
  await createShippingWebhookGuard({ limit: 1 })(
    request.ctx,
    async () => { nextCalls += 1; },
  );
  assert.equal(nextCalls, 1);
  assert.equal(request.bodyReads(), 0);
});
