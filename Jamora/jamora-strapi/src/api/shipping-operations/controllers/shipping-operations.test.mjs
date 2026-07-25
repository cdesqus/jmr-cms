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

test("address routes expose only the two checkout operations", () => {
  assert.deepEqual(routes.routes.map(({ method, path, handler }) => ({ method, path, handler })), [
    { method: "POST", path: "/jamora/address/suggest", handler: "shipping-operations.suggestAddress" },
    { method: "POST", path: "/jamora/address/assess", handler: "shipping-operations.assessAddress" },
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
