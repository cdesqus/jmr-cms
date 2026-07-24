import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer plan listing validates a customer session instead of feature gate alone", async () => {
  const source = await readFile(new URL("./membership-operations.ts", import.meta.url), "utf8");
  assert.match(source, /async plans\(ctx: any\) \{ const identity = await customer\(ctx\)/);
  assert.doesNotMatch(source, /async plans\(ctx: any\) \{ if \(enabled\(ctx\)\)/);
});

test("plans and me GET handlers use trusted header identity without request bodies", async () => {
  const previous = {
    enabled: process.env.MEMBERSHIP_ENABLED,
    secret: process.env.JAMORA_STOREFRONT_API_SECRET,
    strapi: globalThis.strapi,
  };
  process.env.MEMBERSHIP_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "trusted";
  const authCalls = [];
  globalThis.strapi = {
    service(uid) {
      if (uid === "api::customer-auth.customer-auth") {
        return { findActiveSessionCustomer: async (...args) => {
          authCalls.push(args);
          return { documentId: "customer-1" };
        } };
      }
      return {
        listPlans: async () => ["plan"],
        customerMemberships: async (id) => [`membership:${id}`],
      };
    },
  };
  try {
    const controller = (await import(`./membership-operations.ts?get=${Date.now()}`)).default;
    const headers = {
      "x-jamora-storefront-secret": "trusted",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "4",
    };
    const makeCtx = () => ({
      request: { method: "GET" },
      get: (name) => headers[name.toLowerCase()] ?? "",
    });
    const plansCtx = makeCtx();
    const meCtx = makeCtx();
    await controller.plans(plansCtx);
    await controller.me(meCtx);
    assert.deepEqual(authCalls, [["customer-1", 4], ["customer-1", 4]]);
    assert.deepEqual(plansCtx.body, { plans: ["plan"] });
    assert.deepEqual(meCtx.body, { memberships: ["membership:customer-1"] });
  } finally {
    if (previous.enabled === undefined) delete process.env.MEMBERSHIP_ENABLED;
    else process.env.MEMBERSHIP_ENABLED = previous.enabled;
    if (previous.secret === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.secret;
    globalThis.strapi = previous.strapi;
  }
});

test("plans GET handler rejects forged header identity before service access", async () => {
  const previousEnabled = process.env.MEMBERSHIP_ENABLED;
  const previousSecret = process.env.JAMORA_STOREFRONT_API_SECRET;
  const previousStrapi = globalThis.strapi;
  process.env.MEMBERSHIP_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "trusted";
  let serviceCalled = false;
  globalThis.strapi = { service() { serviceCalled = true; return {}; } };
  try {
    const controller = (await import(`./membership-operations.ts?forged=${Date.now()}`)).default;
    const ctx = {
      request: { method: "GET" },
      get(name) {
        return {
          "x-jamora-storefront-secret": "forged",
          "x-jamora-customer-document-id": "victim",
          "x-jamora-customer-session-version": "4",
        }[name.toLowerCase()] ?? "";
      },
    };
    await controller.plans(ctx);
    assert.equal(ctx.status, 401);
    assert.equal(serviceCalled, false);
  } finally {
    if (previousEnabled === undefined) delete process.env.MEMBERSHIP_ENABLED;
    else process.env.MEMBERSHIP_ENABLED = previousEnabled;
    if (previousSecret === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previousSecret;
    globalThis.strapi = previousStrapi;
  }
});
