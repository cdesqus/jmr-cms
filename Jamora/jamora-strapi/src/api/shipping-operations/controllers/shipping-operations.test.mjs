import assert from "node:assert/strict";
import test from "node:test";

import controller from "./shipping-operations.ts";
import routes from "../routes/shipping-operations.ts";

function context({ body = {}, headers = {}, contentType = "application/json", ip = "127.0.0.1" } = {}) {
  const values = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ip,
    request: { body, is: (type) => type === "application/json" && contentType === "application/json" },
    get: (name) => values[name.toLowerCase()] || "",
    set: () => {},
  };
}

async function withEnvironment(values, callback) {
  const original = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return await callback(); } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("shipping operations expose only address assistance and quote selection", () => {
  assert.deepEqual(routes.routes.map(({ method, path, handler }) => ({ method, path, handler })), [
    { method: "POST", path: "/jamora/address/suggest", handler: "shipping-operations.suggestAddress" },
    { method: "POST", path: "/jamora/address/assess", handler: "shipping-operations.assessAddress" },
    { method: "POST", path: "/jamora/shipping/quotes", handler: "shipping-operations.quoteShipping" },
    { method: "POST", path: "/jamora/shipping/select", handler: "shipping-operations.selectShippingQuote" },
  ]);
});

test("address assistance is hidden unless the exact feature flag is true", async () => {
  const ctx = context();
  await withEnvironment({ ADDRESS_ASSIST_ENABLED: "TRUE" }, () => controller.suggestAddress(ctx));
  assert.equal(ctx.status, 404);
  assert.deepEqual(ctx.body, { error: "Not found." });
});

test("suggestion route requires JSON, a trusted storefront, and a checkout capability", async () => {
  await withEnvironment({ ADDRESS_ASSIST_ENABLED: "true", JAMORA_STOREFRONT_API_SECRET: "secret" }, async () => {
    const invalidJson = context({ contentType: "text/plain" });
    await controller.suggestAddress(invalidJson);
    assert.equal(invalidJson.status, 415);

    const unauthorized = context({ body: { query: "Cluj" } });
    await controller.suggestAddress(unauthorized);
    assert.equal(unauthorized.status, 401);

    const allowed = context({
      body: { query: "Memorandumului" },
      headers: { "x-jamora-storefront-secret": "secret", "x-jamora-checkout-capability": "guest-capability" },
    });
    await controller.suggestAddress(allowed);
    assert.equal(allowed.status, undefined);
    assert.deepEqual(allowed.body.suggestions[0], {
      countryCode: "RO", subdivisionCode: "CJ", locality: "Cluj-Napoca",
      postalCode: "400001", street: "Strada Memorandumului", building: "21",
    });
  });
});

test("assess route returns manual DTO plus separate required errors and warnings", async () => {
  await withEnvironment({ ADDRESS_ASSIST_ENABLED: "true", JAMORA_STOREFRONT_API_SECRET: "secret" }, async () => {
    const ctx = context({
      body: { address: {
        recipient: "Ana", countryCode: "RO", subdivisionCode: "CJ", locality: "Bucuresti",
        postalCode: "400001", street: "Manual street", building: "99",
      } },
      headers: { "x-jamora-storefront-secret": "secret", "x-jamora-checkout-capability": "guest-capability" },
    });
    await controller.assessAddress(ctx);
    assert.deepEqual(ctx.body, {
      address: {
        recipient: "Ana", phone: "", countryCode: "RO", subdivisionCode: "CJ", locality: "Bucuresti",
        postalCode: "400001", street: "Manual street", building: "99", unit: "", instructions: "",
      },
      errors: [],
      warnings: ["locality does not match subdivisionCode"],
    });
  });
});

test("shipping quote routes require the exact gate and return only safe quote fields", async () => {
  const originalStrapi = globalThis.strapi;
  const calls = [];
  globalThis.strapi = {
    service(uid) {
      assert.equal(uid, "api::shipping-operations.shipping-quote");
      return {
        async quoteShipping(input) {
          calls.push(input);
          return [{
            quoteId: `shq_${"A".repeat(43)}`,
            carrier: "jamora-mock",
            service: "standard",
            amountMinor: 2090,
            currency: "RON",
            estimate: { minimumDays: 2, maximumDays: 3 },
            quotedAt: "2026-07-25T10:00:00.000Z",
            expiresAt: "2026-07-25T10:15:00.000Z",
            addressDigest: "must-not-leak",
            itemsDigest: "must-not-leak",
            totalWeightGrams: 90,
            zone: "regional",
          }];
        },
      };
    },
  };
  try {
    await withEnvironment({
      SHIPPING_ENABLED: "TRUE",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, async () => {
      const hidden = context();
      await controller.quoteShipping(hidden);
      assert.equal(hidden.status, 404);
    });
    await withEnvironment({
      SHIPPING_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, async () => {
      const ctx = context({
        body: {
          address: { locality: "Cluj-Napoca" },
          items: [{ slug: "energy", qty: 1, weightGrams: 1 }],
        },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-checkout-capability": "guest-capability",
        },
      });
      await controller.quoteShipping(ctx);
      assert.deepEqual(ctx.body, {
        quotes: [{
          quoteId: `shq_${"A".repeat(43)}`,
          carrier: "jamora-mock",
          service: "standard",
          amountMinor: 2090,
          currency: "RON",
          estimate: { minimumDays: 2, maximumDays: 3 },
          quotedAt: "2026-07-25T10:00:00.000Z",
          expiresAt: "2026-07-25T10:15:00.000Z",
        }],
      });
      assert.equal(calls[0].guestCheckoutCapability, "guest-capability");
      assert.equal(calls[0].items[0].weightGrams, 1);
    });
  } finally {
    globalThis.strapi = originalStrapi;
  }
});

test("shipping selection binds verified identity and projects an idempotent safe snapshot", async () => {
  const originalStrapi = globalThis.strapi;
  let selected;
  globalThis.strapi = {
    service(uid) {
      if (uid === "api::customer-auth.customer-auth") {
        return {
          findActiveSessionCustomer: async () => ({
            documentId: "customer-1",
          }),
        };
      }
      assert.equal(uid, "api::shipping-operations.shipping-quote");
      return {
        async selectShippingQuote(input) {
          selected = input;
          return {
            idempotent: true,
            snapshot: {
              quoteId: `shq_${"B".repeat(43)}`,
              carrier: "jamora-mock",
              service: "express",
              amountMinor: 3890,
              currency: "RON",
              estimate: { minimumDays: 1, maximumDays: 2 },
              quotedAt: "2026-07-25T10:00:00.000Z",
              expiresAt: "2026-07-25T10:15:00.000Z",
              addressDigest: "must-not-leak",
              itemsDigest: "must-not-leak",
              totalWeightGrams: 90,
              zone: "regional",
            },
          };
        },
      };
    },
  };
  try {
    await withEnvironment({
      SHIPPING_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, async () => {
      const ctx = context({
        body: {
          subjectType: "order",
          subjectId: "order-1",
          selection: { quoteId: `shq_${"B".repeat(43)}` },
        },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-customer-document-id": "customer-1",
          "x-jamora-customer-session-version": "2",
        },
      });
      await controller.selectShippingQuote(ctx);
      assert.equal(selected.customerDocumentId, "customer-1");
      assert.deepEqual(ctx.body, {
        idempotent: true,
        shipping: {
          quoteId: `shq_${"B".repeat(43)}`,
          carrier: "jamora-mock",
          service: "express",
          amountMinor: 3890,
          currency: "RON",
          estimate: { minimumDays: 1, maximumDays: 2 },
          quotedAt: "2026-07-25T10:00:00.000Z",
          expiresAt: "2026-07-25T10:15:00.000Z",
        },
      });
    });
  } finally {
    globalThis.strapi = originalStrapi;
  }
});
