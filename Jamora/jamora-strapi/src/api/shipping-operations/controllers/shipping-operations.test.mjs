import assert from "node:assert/strict";
import test from "node:test";

import controller, {
  createShippingOperationsController,
} from "./shipping-operations.ts";
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

function reservationDatabase(tokens, expiresAt = "2099-07-25T10:00:00.000Z") {
  const reservations = new Map(tokens.map((token, index) => [
    token,
    {
      documentId: `reservation-${index + 1}`,
      token,
      status: "reserved",
      expiresAt,
    },
  ]));
  const byDocumentId = new Map(
    [...reservations.values()].map((reservation) => [
      reservation.documentId,
      reservation,
    ]),
  );
  return {
    transaction: async (callback) => callback({ trx: { marker: "reservation-lock" } }),
    query(uid) {
      assert.equal(uid, "api::stock-reservation.stock-reservation");
      return {
        async findOne({ where }) {
          return where.token
            ? reservations.get(where.token) ?? null
            : byDocumentId.get(where.documentId) ?? null;
        },
      };
    },
    connection(table) {
      assert.equal(table, "stock_reservations");
      const chain = {
        where: () => chain,
        transacting: () => chain,
        forUpdate: () => chain,
        first: async () => ({}),
      };
      return chain;
    },
  };
}

test("shipping operations expose only explicit address, quote, shipment, and private-label routes", () => {
  assert.deepEqual(routes.routes.map(({ method, path, handler }) => ({ method, path, handler })), [
    { method: "POST", path: "/jamora/address/suggest", handler: "shipping-operations.suggestAddress" },
    { method: "POST", path: "/jamora/address/assess", handler: "shipping-operations.assessAddress" },
    { method: "POST", path: "/jamora/shipping/quotes", handler: "shipping-operations.quoteShipping" },
    { method: "POST", path: "/jamora/shipping/select", handler: "shipping-operations.selectShippingQuote" },
    { method: "POST", path: "/jamora/admin/shipping/shipments/:orderDocumentId", handler: "shipping-operations.createShipment" },
    { method: "POST", path: "/jamora/admin/shipping/shipments/:shipmentDocumentId/labels/capability", handler: "shipping-operations.createLabelCapability" },
    { method: "GET", path: "/jamora/admin/shipping/shipments/:shipmentDocumentId/labels", handler: "shipping-operations.downloadLabel" },
  ]);
});

test("address assistance is hidden unless the exact feature flag is true", async () => {
  const ctx = context();
  await withEnvironment({ ADDRESS_ASSIST_ENABLED: "TRUE" }, () => controller.suggestAddress(ctx));
  assert.equal(ctx.status, 404);
  assert.deepEqual(ctx.body, { error: "Not found." });
});

test("suggestion route requires JSON, a trusted storefront, and a checkout capability", async () => {
  const originalStrapi = globalThis.strapi;
  globalThis.strapi = { db: reservationDatabase(["guest-capability"]) };
  try {
    await withEnvironment({
      ADDRESS_ASSIST_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, async () => {
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
  } finally {
    globalThis.strapi = originalStrapi;
  }
});

test("guest address and quote capability must be an issued live stock reservation", async () => {
  const originalStrapi = globalThis.strapi;
  const liveToken = "rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4";
  const expiredToken = "rsv_75b799b2-4fa0-4cab-9ef8-a82ffd7557c4";
  globalThis.strapi = { db: reservationDatabase([liveToken]) };
  try {
    await withEnvironment({
      ADDRESS_ASSIST_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, async () => {
      const fabricated = context({
        body: { query: "Memorandumului" },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-checkout-capability": "rsv_aaaaaaaa-4aaa-8aaa-aaaa-aaaaaaaaaaaa",
        },
        ip: "192.0.2.40",
      });
      await controller.suggestAddress(fabricated);
      assert.equal(fabricated.status, 401);
      assert.deepEqual(fabricated.body, {
        error: "Invalid or expired guest checkout capability.",
      });

      globalThis.strapi.db = reservationDatabase(
        [expiredToken],
        "2020-07-25T10:00:00.000Z",
      );
      const expired = context({
        body: { query: "Memorandumului" },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-checkout-capability": expiredToken,
        },
        ip: "192.0.2.40",
      });
      await controller.suggestAddress(expired);
      assert.equal(expired.status, 401);

      globalThis.strapi.db = reservationDatabase([liveToken]);
      const live = context({
        body: { query: "Memorandumului" },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-checkout-capability": liveToken,
        },
        ip: "192.0.2.40",
      });
      await controller.suggestAddress(live);
      assert.equal(live.status, undefined);
      assert.equal(live.body.suggestions.length > 0, true);
    });
  } finally {
    globalThis.strapi = originalStrapi;
  }
});

test("rate limiting is isolated by verified checkout identity behind one storefront IP", async () => {
  const originalStrapi = globalThis.strapi;
  globalThis.strapi = {
    service(uid) {
      assert.equal(uid, "api::customer-auth.customer-auth");
      return {
        async findActiveSessionCustomer(documentId) {
          return { documentId };
        },
      };
    },
  };
  try {
    await withEnvironment({
      ADDRESS_ASSIST_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, async () => {
      const requestFor = (documentId) => context({
        body: { query: "Memorandumului" },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-customer-document-id": documentId,
          "x-jamora-customer-session-version": "1",
        },
        ip: "192.0.2.50",
      });
      for (let index = 0; index < 30; index += 1) {
        const allowed = requestFor("rate-customer-a");
        await controller.suggestAddress(allowed);
        assert.equal(allowed.status, undefined);
      }
      const limited = requestFor("rate-customer-a");
      await controller.suggestAddress(limited);
      assert.equal(limited.status, 429);

      const otherCustomer = requestFor("rate-customer-b");
      await controller.suggestAddress(otherCustomer);
      assert.equal(otherCustomer.status, undefined);
    });
  } finally {
    globalThis.strapi = originalStrapi;
  }
});

test("assess route returns manual DTO plus separate required errors and warnings", async () => {
  const originalStrapi = globalThis.strapi;
  globalThis.strapi = { db: reservationDatabase(["guest-capability"]) };
  try {
    await withEnvironment({
      ADDRESS_ASSIST_ENABLED: "false",
      SHIPPING_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, async () => {
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
  } finally {
    globalThis.strapi = originalStrapi;
  }
});

test("shipping quote routes require the exact gate and return only safe quote fields", async () => {
  const originalStrapi = globalThis.strapi;
  const calls = [];
  globalThis.strapi = {
    db: reservationDatabase(["guest-capability"]),
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
            estimate: {
              minimumDays: 2,
              maximumDays: 3,
              providerSecret: "must-not-leak",
            },
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

test("membership shipping quotes require a verified customer session", async () => {
  const originalStrapi = globalThis.strapi;
  let calls = 0;
  globalThis.strapi = {
    service(uid) {
      assert.equal(uid, "api::shipping-operations.shipping-quote");
      return {
        async quoteShipping() {
          calls += 1;
          throw new Error("must not be called");
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
          subjectType: "membership_checkout",
          address: { locality: "Cluj-Napoca" },
          items: [{ slug: "energy", qty: 1 }],
        },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-checkout-capability": "checkout-reference",
        },
      });

      await controller.quoteShipping(ctx);

      assert.equal(ctx.status, 401);
      assert.deepEqual(ctx.body, {
        error: "Verified customer session required for membership checkout.",
      });
      assert.equal(calls, 0);
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

test("membership shipping selection requires a verified customer and rejects a guest checkout capability", async () => {
  const originalStrapi = globalThis.strapi;
  let calls = 0;
  globalThis.strapi = {
    service(uid) {
      assert.equal(uid, "api::shipping-operations.shipping-quote");
      return {
        async selectShippingQuote() {
          calls += 1;
          throw new Error("must not be called");
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
          subjectType: "membership_checkout",
          subjectId: "checkout-reference",
          selection: { quoteId: `shq_${"C".repeat(43)}` },
        },
        headers: {
          "x-jamora-storefront-secret": "secret",
          "x-jamora-checkout-capability": "checkout-reference",
        },
      });

      await controller.selectShippingQuote(ctx);

      assert.equal(ctx.status, 401);
      assert.deepEqual(ctx.body, {
        error: "Verified customer session required for membership checkout.",
      });
      assert.equal(calls, 0);
    });
  } finally {
    globalThis.strapi = originalStrapi;
  }
});

test("shipment administration is exact-gated to trusted owner and warehouse identities", async () => {
  const calls = [];
  const shipmentController = createShippingOperationsController({
    shipmentTransactions: () => ({
      async createShipment(input) {
        calls.push(input);
        return {
          idempotent: false,
          shipment: {
            documentId: "shipment-1",
            orderDocumentId: input.orderDocumentId,
            orderNumber: "JMR-1001",
            carrier: "jamora-mock",
            service: "standard",
            awb: "JMR202607251200001234",
            status: "label_created",
            labelFormats: ["pdf", "zpl"],
          },
        };
      },
    }),
  });

  await withEnvironment({
    SHIPPING_ENABLED: "true",
    JAMORA_ADMIN_API_SECRET: "admin-secret",
  }, async () => {
    for (const role of ["owner", "warehouse"]) {
      const ctx = context({
        headers: {
          "x-jamora-admin-secret": "admin-secret",
          "x-jamora-admin-actor": `${role}@example.test`,
          "x-jamora-admin-role": role,
        },
      });
      ctx.params = { orderDocumentId: `order-${role}` };
      await shipmentController.createShipment(ctx);
      assert.equal(ctx.status, undefined);
      assert.equal(ctx.body.shipment.orderDocumentId, `order-${role}`);
    }

    for (const headers of [
      {
        "x-jamora-admin-secret": "wrong",
        "x-jamora-admin-actor": "owner@example.test",
        "x-jamora-admin-role": "owner",
      },
      {
        "x-jamora-admin-secret": "admin-secret",
        "x-jamora-admin-actor": "support@example.test",
        "x-jamora-admin-role": "support",
      },
      {
        "x-jamora-admin-secret": "admin-secret",
        "x-jamora-admin-role": "warehouse",
      },
    ]) {
      const ctx = context({ headers });
      ctx.params = { orderDocumentId: "order-forbidden" };
      await shipmentController.createShipment(ctx);
      assert.equal(ctx.status, 401);
      assert.deepEqual(ctx.body, {
        error: "Owner or warehouse admin credentials required.",
      });
    }
  });
  assert.deepEqual(calls.map(({ orderDocumentId, actor }) => ({
    orderDocumentId,
    actor,
  })), [
    { orderDocumentId: "order-owner", actor: "owner@example.test" },
    { orderDocumentId: "order-warehouse", actor: "warehouse@example.test" },
  ]);
});

test("private label controller issues a capability and streams only safe PDF headers", async () => {
  const calls = [];
  const shipmentController = createShippingOperationsController({
    shipmentTransactions: () => ({
      async createLabelCapability(input) {
        calls.push(["issue", input]);
        return {
          capability: "opaque.signed",
          expiresAt: "2026-07-25T12:01:00.000Z",
          format: "pdf",
          providerUrl: "https://provider.example/never-forward",
        };
      },
      async downloadLabel(input) {
        calls.push(["download", input]);
        return {
          contentType: "application/pdf",
          filename: "JMR-1001-label.pdf",
          body: Buffer.from("%PDF-1.4\n%%EOF"),
          providerUrl: "https://provider.example/never-forward",
        };
      },
    }),
  });

  await withEnvironment({
    SHIPPING_ENABLED: "true",
    JAMORA_ADMIN_API_SECRET: "admin-secret",
  }, async () => {
    const headers = {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "warehouse@example.test",
      "x-jamora-admin-role": "warehouse",
    };
    const issue = context({ body: { format: "pdf" }, headers });
    issue.params = { shipmentDocumentId: "shipment-1" };
    await shipmentController.createLabelCapability(issue);
    assert.deepEqual(issue.body, {
      capability: "opaque.signed",
      expiresAt: "2026-07-25T12:01:00.000Z",
      format: "pdf",
    });

    const responseHeaders = new Map();
    const download = context({ headers });
    download.params = { shipmentDocumentId: "shipment-1" };
    download.query = { capability: "opaque.signed" };
    download.set = (name, value) => responseHeaders.set(name.toLowerCase(), value);
    await shipmentController.downloadLabel(download);
    assert.equal(download.status, undefined);
    assert.equal(download.body.toString("utf8"), "%PDF-1.4\n%%EOF");
    assert.equal(responseHeaders.get("content-type"), "application/pdf");
    assert.equal(
      responseHeaders.get("content-disposition"),
      'attachment; filename="JMR-1001-label.pdf"',
    );
    assert.equal(responseHeaders.get("cache-control"), "no-store, private");
    assert.equal(responseHeaders.get("x-content-type-options"), "nosniff");
    assert.equal(JSON.stringify([...responseHeaders]).includes("provider.example"), false);
  });

  assert.deepEqual(calls.map(([operation, input]) => [
    operation,
    {
      shipmentDocumentId: input.shipmentDocumentId,
      format: input.format,
      capability: input.capability,
      actor: input.actor,
    },
  ]), [
    ["issue", {
      shipmentDocumentId: "shipment-1",
      format: "pdf",
      capability: undefined,
      actor: "warehouse@example.test",
    }],
    ["download", {
      shipmentDocumentId: "shipment-1",
      format: undefined,
      capability: "opaque.signed",
      actor: undefined,
    }],
  ]);
});

test("shipment feature flag fails closed and unexpected provider messages are not relayed", async () => {
  let calls = 0;
  const shipmentController = createShippingOperationsController({
    shipmentTransactions: () => ({
      async createShipment() {
        calls += 1;
        throw new TypeError("Provider API secret sk_live_never_expose");
      },
    }),
  });
  const headers = {
    "x-jamora-admin-secret": "admin-secret",
    "x-jamora-admin-actor": "owner@example.test",
    "x-jamora-admin-role": "owner",
  };

  await withEnvironment({
    SHIPPING_ENABLED: "TRUE",
    JAMORA_ADMIN_API_SECRET: "admin-secret",
  }, async () => {
    const disabled = context({ headers });
    disabled.params = { orderDocumentId: "order-1" };
    await shipmentController.createShipment(disabled);
    assert.equal(disabled.status, 404);
    assert.equal(calls, 0);
  });

  await withEnvironment({
    SHIPPING_ENABLED: "true",
    JAMORA_ADMIN_API_SECRET: "admin-secret",
  }, async () => {
    const failed = context({ headers });
    failed.params = { orderDocumentId: "order-1" };
    await shipmentController.createShipment(failed);
    assert.equal(failed.status, 502);
    assert.deepEqual(failed.body, { error: "Shipping service unavailable." });
    assert.equal(JSON.stringify(failed.body).includes("sk_live"), false);
  });
});

test("shipment mutations reject oversized JSON before transaction service access", async () => {
  let calls = 0;
  const shipmentController = createShippingOperationsController({
    shipmentTransactions: () => ({
      async createShipment() { calls += 1; },
      async createLabelCapability() { calls += 1; },
    }),
  });
  const headers = {
    "content-length": "4097",
    "x-jamora-admin-secret": "admin-secret",
    "x-jamora-admin-actor": "warehouse@example.test",
    "x-jamora-admin-role": "warehouse",
  };

  await withEnvironment({
    SHIPPING_ENABLED: "true",
    JAMORA_ADMIN_API_SECRET: "admin-secret",
  }, async () => {
    const create = context({ headers });
    create.params = { orderDocumentId: "order-1" };
    await shipmentController.createShipment(create);
    assert.equal(create.status, 413);

    const capability = context({ body: { format: "pdf" }, headers });
    capability.params = { shipmentDocumentId: "shipment-1" };
    await shipmentController.createLabelCapability(capability);
    assert.equal(capability.status, 413);
  });
  assert.equal(calls, 0);
});
