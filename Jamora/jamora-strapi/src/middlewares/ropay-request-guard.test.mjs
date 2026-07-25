import assert from "node:assert/strict";
import test from "node:test";

import middlewares from "../../config/middlewares.ts";
import guardModule from "./ropay-request-guard.cjs";

const {
  createRoPayRequestGuard,
  createRoPayRequestLimiter,
} = guardModule;

function context({
  path = "/api/jamora/payments/ropay/callback",
  ip = "192.0.2.1",
  headers = {},
} = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  let bodyReads = 0;
  const request = { ip };
  Object.defineProperty(request, "body", {
    get() {
      bodyReads += 1;
      throw new Error("request body was accessed before Strapi body parsing");
    },
  });
  return {
    ctx: {
      path,
      method: "POST",
      ip,
      request,
      status: 200,
      body: undefined,
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
  "x-ropay-provider-reference": "RPI-1",
};

test("configured RoPay guard runs before the global Strapi body parser", () => {
  const guardIndex = middlewares.findIndex(
    (entry) => typeof entry === "object" &&
      entry.name === "global::ropay-request-guard",
  );
  const bodyIndex = middlewares.indexOf("strapi::body");
  assert.ok(guardIndex >= 0);
  assert.ok(bodyIndex >= 0);
  assert.ok(guardIndex < bodyIndex);
});

test("valid callback metadata reaches body parsing without reading the body", async () => {
  const guard = createRoPayRequestGuard({ limit: 10 });
  const request = context({ headers: validHeaders });
  let nextCalls = 0;

  await guard(request.ctx, async () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
  assert.equal(request.bodyReads(), 0);
  assert.equal(request.ctx.status, 200);
});

test("oversized and multipart callbacks reject before parsing or handler work", async () => {
  for (const [headers, status] of [
    [{ ...validHeaders, "content-length": "4097" }, 413],
    [{ ...validHeaders, "content-type": "multipart/form-data; boundary=x" }, 415],
    [{ ...validHeaders, "content-type": "application/x-www-form-urlencoded" }, 415],
  ]) {
    const guard = createRoPayRequestGuard({ maxBytes: 4096, limit: 10 });
    const request = context({ headers });
    let nextCalls = 0;

    await guard(request.ctx, async () => { nextCalls += 1; });

    assert.equal(request.ctx.status, status);
    assert.equal(nextCalls, 0);
    assert.equal(request.bodyReads(), 0);
  }
});

test("router-compatible trailing slash cannot bypass the pre-body guard", async () => {
  for (const path of [
    "/api/jamora/payments/ropay/callback/",
    "/api/jamora/internal/payments/ropay/status/",
  ]) {
    const guard = createRoPayRequestGuard({ maxBytes: 4096, limit: 10 });
    const request = context({
      path,
      headers: {
        ...validHeaders,
        "content-type": "multipart/form-data; boundary=x",
      },
    });
    await guard(
      request.ctx,
      async () => assert.fail("trailing slash must remain guarded"),
    );
    assert.equal(request.ctx.status, 415);
    assert.equal(request.bodyReads(), 0);
  }
});

test("callback requires explicit bounded length, identity encoding, and provider reference", async () => {
  for (const [headers, status] of [
    [{ ...validHeaders, "content-length": "" }, 411],
    [{ ...validHeaders, "transfer-encoding": "chunked" }, 411],
    [{ ...validHeaders, "content-encoding": "gzip" }, 415],
    [{ ...validHeaders, "x-ropay-provider-reference": "" }, 400],
    [{ ...validHeaders, "x-ropay-provider-reference": "bad reference" }, 400],
  ]) {
    const guard = createRoPayRequestGuard({ limit: 10 });
    const request = context({ headers });
    await guard(request.ctx, async () => assert.fail("guard must reject"));
    assert.equal(request.ctx.status, status);
    assert.equal(request.bodyReads(), 0);
  }
});

test("non-provider paths pass through without provider headers or body access", async () => {
  const guard = createRoPayRequestGuard({ limit: 1 });
  const request = context({
    path: "/api/jamora/payments/bank-transfer",
    headers: {},
  });
  let nextCalls = 0;
  await guard(request.ctx, async () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(request.bodyReads(), 0);
});

test("rate limiter independently bounds callback IP and provider-reference dimensions", () => {
  const byIp = createRoPayRequestLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => 0,
  });
  assert.equal(byIp.check("callback", "192.0.2.1", "RPI-1").allowed, true);
  assert.equal(byIp.check("callback", "192.0.2.1", "RPI-2").allowed, true);
  assert.equal(byIp.check("callback", "192.0.2.1", "RPI-3").allowed, false);

  const byReference = createRoPayRequestLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => 0,
  });
  assert.equal(byReference.check("status", "192.0.2.1", "RPI-1").allowed, true);
  assert.equal(byReference.check("status", "192.0.2.2", "RPI-1").allowed, true);
  assert.equal(byReference.check("status", "192.0.2.3", "RPI-1").allowed, false);
});

test("rate-limited requests return generic 429 without body parsing and buckets stay bounded", async () => {
  const guard = createRoPayRequestGuard({
    limit: 1,
    windowMs: 2_000,
    maxBuckets: 4,
    now: () => 0,
  });
  const first = context({ headers: validHeaders });
  await guard(first.ctx, async () => undefined);

  const blocked = context({ headers: validHeaders });
  await guard(blocked.ctx, async () => assert.fail("rate limit must reject"));
  assert.equal(blocked.ctx.status, 429);
  assert.deepEqual(blocked.ctx.body, { error: "Request could not be completed." });
  assert.deepEqual(blocked.ctx.responseHeaders, { "Retry-After": "2" });
  assert.equal(blocked.bodyReads(), 0);

  const limiter = createRoPayRequestLimiter({
    limit: 10,
    maxBuckets: 4,
    now: () => 0,
  });
  for (let index = 0; index < 20; index += 1) {
    limiter.check("callback", `192.0.2.${index}`, `RPI-${index}`);
  }
  assert.ok(limiter.bucketCount() <= 4);
});
