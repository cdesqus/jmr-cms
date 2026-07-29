import assert from "node:assert/strict";
import test from "node:test";

import { createShippingOperationsController } from "./shipping-operations.ts";
import routes from "../routes/shipping-operations.ts";

function context({
  body = {},
  role,
  headers = {},
} = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    request: {
      body,
      is(value) {
        return value === "application/json";
      },
    },
    params: {},
    status: 200,
    body: undefined,
    get(name) {
      if (name.toLowerCase() === "x-jamora-admin-secret") return "admin-secret";
      if (name.toLowerCase() === "x-jamora-admin-actor") return "owner@example.test";
      if (name.toLowerCase() === "x-jamora-admin-role") return role ?? "";
      return normalized[name.toLowerCase()] ?? "";
    },
    set() {},
  };
}

test("tracking webhook authenticates before provider-event limiting and transition work", async () => {
  const calls = [];
  const controller = createShippingOperationsController({
    trackingDomain: () => ({
      async applyTrackingEvent(input) {
        calls.push(["apply", input]);
        return {
          idempotent: false,
          applied: true,
          outcome: "applied",
          shipment: { status: "in_transit" },
        };
      },
    }),
    verifyWebhook(input) {
      calls.push(["verify", input]);
      return input.payload;
    },
    authenticatedTrackingLimiter: {
      check(event) {
        calls.push(["limit", event]);
        return { allowed: true };
      },
    },
  });
  const payload = {
    providerEventId: "evt-1",
    provider: "jamora-mock",
    awb: "JMR000000000000000001",
    status: "in_transit",
    occurredAt: "2026-07-25T12:00:00.000Z",
  };
  const ctx = context({
    body: payload,
    headers: {
      "content-length": "256",
      "x-jamora-shipping-provider": "jamora-mock",
      "x-jamora-shipping-timestamp": "1784980800",
      "x-jamora-shipping-signature": `sha256=${"a".repeat(64)}`,
    },
  });
  process.env.SHIPPING_ENABLED = "true";
  process.env.SHIPPING_TRACKING_WEBHOOK_SECRET =
    "shipping-webhook-secret-at-least-32-bytes";

  await controller.trackingWebhook(ctx);

  assert.deepEqual(calls.map(([name]) => name), ["verify", "limit", "apply"]);
  assert.deepEqual(ctx.body, {
    accepted: true,
    idempotent: false,
    applied: true,
    outcome: "applied",
    status: "in_transit",
  });
});

test("invalid signature cannot consume authenticated limits or reach tracking state", async () => {
  let limiterCalls = 0;
  let applyCalls = 0;
  const controller = createShippingOperationsController({
    trackingDomain: () => ({
      async applyTrackingEvent() {
        applyCalls += 1;
      },
    }),
    verifyWebhook() {
      throw new Error("Invalid webhook signature.");
    },
    authenticatedTrackingLimiter: {
      check() {
        limiterCalls += 1;
        return { allowed: true };
      },
    },
  });
  const ctx = context({
    body: { providerEventId: "evt-invalid" },
    headers: { "content-length": "64" },
  });
  process.env.SHIPPING_ENABLED = "true";

  await controller.trackingWebhook(ctx);

  assert.equal(ctx.status, 401);
  assert.deepEqual(ctx.body, { error: "Request could not be completed." });
  assert.equal(limiterCalls, 0);
  assert.equal(applyCalls, 0);
});

test("authenticated event limit and foreign AWB failures are safely rejected", async () => {
  const limitedController = createShippingOperationsController({
    trackingDomain: () => ({ applyTrackingEvent: async () => assert.fail("must not apply") }),
    verifyWebhook: ({ payload }) => payload,
    authenticatedTrackingLimiter: {
      check: () => ({ allowed: false, retryAfter: 7 }),
    },
  });
  const limited = context({
    body: { providerEventId: "evt-limited" },
    headers: { "content-length": "64" },
  });
  process.env.SHIPPING_ENABLED = "true";
  await limitedController.trackingWebhook(limited);
  assert.equal(limited.status, 429);

  const foreignController = createShippingOperationsController({
    trackingDomain: () => ({
      applyTrackingEvent: async () => { throw new Error("Shipment not found."); },
    }),
    verifyWebhook: ({ payload }) => payload,
    authenticatedTrackingLimiter: { check: () => ({ allowed: true }) },
  });
  const foreign = context({
    body: { providerEventId: "evt-foreign" },
    headers: { "content-length": "64" },
  });
  await foreignController.trackingWebhook(foreign);
  assert.equal(foreign.status, 404);
  assert.deepEqual(foreign.body, { error: "Request could not be completed." });
});

test("only owner may trigger a bounded tracking poll", async () => {
  const calls = [];
  const controller = createShippingOperationsController({
    trackingDomain: () => ({
      async pollOpenShipments(input) {
        calls.push(input);
        return { attempted: 2, applied: 1, replayed: 1, ignored: 0, failed: 0 };
      },
    }),
  });
  process.env.SHIPPING_ENABLED = "true";
  process.env.JAMORA_ADMIN_API_SECRET = "admin-secret";

  const warehouse = context({ role: "warehouse", body: { limit: 2 } });
  await controller.pollTracking(warehouse);
  assert.equal(warehouse.status, 403);
  assert.equal(calls.length, 0);

  const owner = context({ role: "owner", body: { limit: 2, provider: "forged" } });
  await controller.pollTracking(owner);
  assert.deepEqual(calls, [{ limit: 2 }]);
  assert.deepEqual(owner.body, {
    attempted: 2,
    applied: 1,
    replayed: 1,
    ignored: 0,
    failed: 0,
  });
});

test("tracking webhook and owner polling routes are explicit and public-auth disabled", () => {
  assert.ok(routes.routes.some((route) =>
    route.method === "POST" &&
    route.path === "/jamora/shipping/tracking/webhook" &&
    route.handler === "shipping-operations.trackingWebhook" &&
    route.config?.auth === false));
  assert.ok(routes.routes.some((route) =>
    route.method === "POST" &&
    route.path === "/jamora/admin/shipping/tracking/poll" &&
    route.handler === "shipping-operations.pollTracking" &&
    route.config?.auth === false));
});
