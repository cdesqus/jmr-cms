import assert from "node:assert/strict";
import test from "node:test";

import controller from "./payment-operations.ts";

function context(body = {}, headers = {}, params = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    request: { body, method: "POST" },
    params,
    get(name) { return normalized[name.toLowerCase()] ?? ""; },
    status: 200,
    body: undefined,
  };
}

function installStrapi(paymentService, customer = null) {
  globalThis.strapi = {
    service(uid) {
      if (uid === "api::payment-operations.payment-operations") return paymentService;
      if (uid === "api::customer-auth.customer-auth") {
        return {
          findActiveSessionCustomer: async (documentId, version) =>
            customer?.documentId === documentId && customer?.sessionVersion === version
              ? customer
              : null,
        };
      }
      throw new Error(`unexpected service ${uid}`);
    },
  };
}

test("payment controllers hide all endpoints unless PAYMENTS_ENABLED is exactly true", async () => {
  const previous = process.env.PAYMENTS_ENABLED;
  try {
    for (const value of ["false", "TRUE", "1", ""]) {
      process.env.PAYMENTS_ENABLED = value;
      installStrapi({ prepareBankTransfer: async () => assert.fail("service must not run") });
      const ctx = context();
      await controller.prepareBankTransfer(ctx);
      assert.equal(ctx.status, 404);
      assert.deepEqual(ctx.body, { error: "Not found." });
    }
  } finally {
    if (previous === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous;
  }
});

test("trusted storefront preparation binds an authoritative customer session", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    storefront: process.env.JAMORA_STOREFRONT_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
  let prepared;
  installStrapi({
    async prepareBankTransfer(input) {
      prepared = input;
      return {
        documentId: "payment-1",
        idempotencyKey: "internal-key",
        settlementKey: "internal-settlement",
        ownerDocumentId: "customer-1",
        subjectId: "membership-1",
        amountMinor: 10_000,
        currency: "RON",
        method: "bank_transfer",
        status: "awaiting_payment",
        paymentReference: "JMR-ABC",
        expiresAt: "2026-07-26T00:00:00.000Z",
        priceSnapshot: {
          bankTransfer: {
            name: "Jamora SRL",
            iban: "RO49AAAA1B31007593840000",
          },
          internal: "do not expose",
        },
      };
    },
  }, { documentId: "customer-1", sessionVersion: 4, email: "customer@example.test" });
  try {
    const ctx = context({
      subjectType: "membership",
      subjectId: "membership-1",
      purpose: "membership_purchase",
      customerDocumentId: "forged",
      ownerDocumentId: "forged",
      amountMinor: 10_000,
      currency: "RON",
      idempotencyKey: "prepare-1",
      priceSnapshot: {},
    }, {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "4",
    });

    await controller.prepareBankTransfer(ctx);

    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      method: "bank_transfer",
      status: "awaiting_payment",
      paymentReference: "JMR-ABC",
      amountMinor: 10_000,
      currency: "RON",
      expiresAt: "2026-07-26T00:00:00.000Z",
      beneficiary: {
        name: "Jamora SRL",
        iban: "RO49AAAA1B31007593840000",
      },
    });
    assert.equal(prepared.customerDocumentId, "customer-1");
    assert.equal(prepared.ownerDocumentId, "customer-1");
    assert.equal(prepared.guestCheckoutCapability, undefined);
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.storefront === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefront;
  }
});

test("trusted guest preparation requires an order checkout capability", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    storefront: process.env.JAMORA_STOREFRONT_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
  let prepared;
  installStrapi({
    async prepareBankTransfer(input) {
      prepared = input;
      return { documentId: "payment-1" };
    },
  });
  try {
    const missing = context({
      subjectType: "order",
      subjectId: "reservation-1",
      purpose: "order",
    }, { "x-jamora-storefront-secret": "storefront-secret" });
    await controller.prepareBankTransfer(missing);
    assert.equal(missing.status, 401);

    const membership = context({
      subjectType: "membership",
      subjectId: "membership-1",
      purpose: "membership_purchase",
      guestCheckoutCapability: "reservation-1",
    }, { "x-jamora-storefront-secret": "storefront-secret" });
    await controller.prepareBankTransfer(membership);
    assert.equal(membership.status, 401);

    const guest = context({
      subjectType: "order",
      subjectId: "order-1",
      purpose: "order",
      guestCheckoutCapability: "reservation-1",
    }, { "x-jamora-storefront-secret": "storefront-secret" });
    await controller.prepareBankTransfer(guest);
    assert.equal(guest.status, 200);
    assert.equal(prepared.guestCheckoutCapability, "reservation-1");
    assert.equal(prepared.customerDocumentId, undefined);
    assert.equal(prepared.ownerDocumentId, undefined);
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.storefront === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefront;
  }
});

test("receipt and mismatch resolution require owner credentials and server-derived actor", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    admin: process.env.JAMORA_ADMIN_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.JAMORA_ADMIN_API_SECRET = "admin-secret";
  let received;
  installStrapi({
    async recordBankReceipt(input) {
      received = input;
      return { status: "underpaid" };
    },
  });
  try {
    const denied = context({}, {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "operator@example.test",
      "x-jamora-admin-role": "operator",
    }, { documentId: "payment-1" });
    await controller.recordBankReceipt(denied);
    assert.equal(denied.status, 401);

    const accepted = context({
      amountMinor: 9_000,
      currency: "RON",
      actor: "forged@example.test",
      providerEventId: "receipt-1",
    }, {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "owner@example.test",
      "x-jamora-admin-role": "owner",
    }, { documentId: "payment-1" });
    await controller.recordBankReceipt(accepted);
    assert.equal(accepted.status, 200);
    assert.equal(received.actor, "owner@example.test");
    assert.equal(received.paymentDocumentId, "payment-1");
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.admin === undefined) delete process.env.JAMORA_ADMIN_API_SECRET;
    else process.env.JAMORA_ADMIN_API_SECRET = previous.admin;
  }
});
