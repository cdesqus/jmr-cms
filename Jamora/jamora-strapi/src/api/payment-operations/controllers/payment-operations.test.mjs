import assert from "node:assert/strict";
import test from "node:test";

import controller from "./payment-operations.ts";
import routes from "../routes/payment-operations.ts";

function context(body = {}, headers = {}, params = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    request: { body, method: "POST" },
    params,
    get(name) { return normalized[name.toLowerCase()] ?? ""; },
    set(name, value) {
      this.responseHeaders = {
        ...(this.responseHeaders ?? {}),
        [name]: value,
      };
    },
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

test("receipt, resolution, and expiry return minimal owner reconciliation DTOs", async () => {
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
      return {
        documentId: "payment-1", paymentReference: "JMR-1", status: "underpaid", idempotent: false,
        idempotencyKey: "internal-key", settlementKey: "settlement-key", providerReference: "provider-ref",
        ownerDocumentId: "owner-1", subjectId: "order-1", priceSnapshot: { secret: "never expose" },
        event: { payload: { secret: "never expose" } },
      };
    },
    async resolvePaymentMismatch() {
      return {
        documentId: "payment-1", paymentReference: "JMR-1", status: "cancelled", idempotent: false,
        idempotencyKey: "internal-key", settlementKey: "settlement-key", providerReference: "provider-ref",
        ownerDocumentId: "owner-1", subjectId: "order-1", priceSnapshot: { secret: "never expose" },
      };
    },
    async expireDuePayments() {
      return 3;
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
    assert.deepEqual(accepted.body, {
      documentId: "payment-1", paymentReference: "JMR-1", status: "underpaid", idempotent: false,
    });

    const resolution = context({ reason: "Bank charge accepted.", resolution: "cancel" }, {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "owner@example.test",
      "x-jamora-admin-role": "owner",
    }, { documentId: "payment-1" });
    await controller.resolvePaymentMismatch(resolution);
    assert.deepEqual(resolution.body, {
      documentId: "payment-1", paymentReference: "JMR-1", status: "cancelled", idempotent: false,
      resolution: "cancel",
    });

    const expiry = context({}, {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "owner@example.test",
      "x-jamora-admin-role": "owner",
    });
    await controller.expireDuePayments(expiry);
    assert.deepEqual(expiry.body, { expired: 3 });
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.admin === undefined) delete process.env.JAMORA_ADMIN_API_SECRET;
    else process.env.JAMORA_ADMIN_API_SECRET = previous.admin;
  }
});

test("owner payment reconciliation list requires the exact feature gate and owner credentials", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    admin: process.env.JAMORA_ADMIN_API_SECRET,
  };
  let calls = 0;
  installStrapi({
    async listAdminPayments() {
      calls += 1;
      return [{ paymentReference: "JMR-1", events: [] }];
    },
  });
  try {
    process.env.PAYMENTS_ENABLED = "TRUE";
    process.env.JAMORA_ADMIN_API_SECRET = "admin-secret";
    const disabled = context({}, {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "owner@example.test",
      "x-jamora-admin-role": "owner",
    });
    disabled.request.method = "GET";
    await controller.listAdminPayments(disabled);
    assert.equal(disabled.status, 404);
    assert.equal(calls, 0);

    process.env.PAYMENTS_ENABLED = "true";
    const denied = context({}, {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "operator@example.test",
      "x-jamora-admin-role": "support",
    });
    denied.request.method = "GET";
    await controller.listAdminPayments(denied);
    assert.equal(denied.status, 401);
    assert.equal(calls, 0);

    const accepted = context({}, {
      "x-jamora-admin-secret": "admin-secret",
      "x-jamora-admin-actor": "owner@example.test",
      "x-jamora-admin-role": "owner",
    });
    accepted.request.method = "GET";
    await controller.listAdminPayments(accepted);
    assert.equal(accepted.status, 200);
    assert.deepEqual(accepted.body, { payments: [{ paymentReference: "JMR-1", events: [] }] });
    assert.equal(calls, 1);
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.admin === undefined) delete process.env.JAMORA_ADMIN_API_SECRET;
    else process.env.JAMORA_ADMIN_API_SECRET = previous.admin;
  }
});

test("RoPay preparation requires both exact feature gates while manual transfer remains available", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    ropay: process.env.ROPAY_ENABLED,
    storefront: process.env.JAMORA_STOREFRONT_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
  let manualCalls = 0;
  installStrapi({
    async prepareBankTransfer() {
      manualCalls += 1;
      return {
        method: "bank_transfer",
        status: "awaiting_payment",
        paymentReference: "JMR-MANUAL",
        amountMinor: 10_000,
        currency: "RON",
        expiresAt: "2026-07-26T00:00:00.000Z",
        priceSnapshot: { bankTransfer: { name: "Jamora", iban: "RO49AAAA1B31007593840000" } },
      };
    },
    async createRoPayIntent() {
      assert.fail("disabled RoPay service must not run");
    },
  }, { documentId: "customer-1", sessionVersion: 4 });
  try {
    for (const value of ["false", "TRUE", "1", ""]) {
      process.env.ROPAY_ENABLED = value;
      const ropay = context({
        subjectType: "order",
        subjectId: "order-1",
        purpose: "order",
      }, {
        "x-jamora-storefront-secret": "storefront-secret",
        "x-jamora-customer-document-id": "customer-1",
        "x-jamora-customer-session-version": "4",
      });
      await controller.prepareRoPay(ropay);
      assert.equal(ropay.status, 404);
    }

    const manual = context({
      subjectType: "order",
      subjectId: "order-1",
      purpose: "order",
    }, {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "4",
    });
    await controller.prepareBankTransfer(manual);
    assert.equal(manual.status, 200);
    assert.equal(manual.body.method, "bank_transfer");
    assert.equal(manualCalls, 1);
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.ropay === undefined) delete process.env.ROPAY_ENABLED;
    else process.env.ROPAY_ENABLED = previous.ropay;
    if (previous.storefront === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefront;
  }
});

test("trusted RoPay preparation binds identity and returns only the safe provider DTO", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    ropay: process.env.ROPAY_ENABLED,
    storefront: process.env.JAMORA_STOREFRONT_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.ROPAY_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
  let received;
  installStrapi({
    async createRoPayIntent(input) {
      received = input;
      return {
        method: "ropay",
        status: "pending_provider",
        paymentReference: "JMR-ROPAY-1",
        amountMinor: 10_000,
        currency: "RON",
        expiresAt: "2026-07-25T12:10:00.000Z",
        qrUrl: "https://mock.ropay.invalid/qr/token",
        deepLink: "ropay://pay/token",
        providerReference: "internal-provider-reference",
        signature: "never-expose",
        settlementKey: "never-expose",
      };
    },
  }, { documentId: "customer-1", sessionVersion: 4 });
  try {
    const ctx = context({
      subjectType: "order",
      subjectId: "order-1",
      purpose: "order",
      customerDocumentId: "forged",
      ownerDocumentId: "forged",
    }, {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "4",
    });
    await controller.prepareRoPay(ctx);
    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      method: "ropay",
      status: "pending_provider",
      paymentReference: "JMR-ROPAY-1",
      amountMinor: 10_000,
      currency: "RON",
      expiresAt: "2026-07-25T12:10:00.000Z",
      qrUrl: "https://mock.ropay.invalid/qr/token",
      deepLink: "ropay://pay/token",
    });
    assert.equal(received.customerDocumentId, "customer-1");
    assert.equal(received.ownerDocumentId, "customer-1");
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.ropay === undefined) delete process.env.ROPAY_ENABLED;
    else process.env.ROPAY_ENABLED = previous.ropay;
    if (previous.storefront === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefront;
  }
});

test("terminal RoPay preparation replay does not add empty QR or deep-link fields", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    ropay: process.env.ROPAY_ENABLED,
    storefront: process.env.JAMORA_STOREFRONT_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.ROPAY_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
  installStrapi({
    async createRoPayIntent() {
      return {
        method: "ropay",
        status: "paid",
        paymentReference: "JMR-ROPAY-1",
        amountMinor: 10_000,
        currency: "RON",
        expiresAt: "2026-07-25T12:10:00.000Z",
      };
    },
  }, { documentId: "customer-1", sessionVersion: 4 });
  try {
    const ctx = context({
      subjectType: "order",
      subjectId: "order-1",
      purpose: "order",
    }, {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "4",
    });
    await controller.prepareRoPay(ctx);
    assert.equal(ctx.status, 200);
    assert.equal(ctx.body.status, "paid");
    assert.equal(Object.hasOwn(ctx.body, "qrUrl"), false);
    assert.equal(Object.hasOwn(ctx.body, "deepLink"), false);
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.ropay === undefined) delete process.env.ROPAY_ENABLED;
    else process.env.ROPAY_ENABLED = previous.ropay;
    if (previous.storefront === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefront;
  }
});

test("provider callback and server status routes forward signed envelopes and return safe acknowledgements", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    ropay: process.env.ROPAY_ENABLED,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.ROPAY_ENABLED = "true";
  let callbackInput;
  let statusInput;
  installStrapi({
    async handleRoPayCallback(input) {
      callbackInput = input;
      return {
        documentId: "payment-1",
        status: "paid",
        idempotent: false,
        settlementKey: "never-expose",
      };
    },
    async verifyRoPayStatus(input) {
      statusInput = input;
      return {
        documentId: "payment-1",
        status: "paid",
        idempotent: true,
      };
    },
  });
  try {
    const body = { providerEventId: "event-1" };
    const headers = {
      "x-ropay-signature": "sha256=signed",
      "x-ropay-timestamp": "2026-07-25T12:00:00.000Z",
      "x-ropay-provider-reference": "RPI-1",
    };
    const callback = context(body, headers);
    await controller.handleRoPayCallback(callback);
    assert.deepEqual(callbackInput, {
      payload: body,
      signature: "sha256=signed",
      timestamp: "2026-07-25T12:00:00.000Z",
      providerReference: "RPI-1",
    });
    assert.deepEqual(callback.body, {
      accepted: true,
      status: "paid",
      idempotent: false,
    });

    const status = context(body, headers);
    await controller.verifyRoPayStatus(status);
    assert.deepEqual(statusInput, {
      payload: body,
      signature: "sha256=signed",
      timestamp: "2026-07-25T12:00:00.000Z",
      providerReference: "RPI-1",
    });
    assert.deepEqual(status.body, {
      accepted: true,
      status: "paid",
      idempotent: true,
    });
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.ropay === undefined) delete process.env.ROPAY_ENABLED;
    else process.env.ROPAY_ENABLED = previous.ropay;
  }
});

test("authenticated provider rate limits return a generic 429 with retry metadata", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    ropay: process.env.ROPAY_ENABLED,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.ROPAY_ENABLED = "true";
  installStrapi({
    async handleRoPayCallback() {
      const error = new Error("RoPay request rate limit exceeded.");
      error.statusCode = 429;
      error.retryAfter = 17;
      throw error;
    },
  });
  try {
    const ctx = context({}, {
      "x-ropay-signature": "sha256=signed",
      "x-ropay-timestamp": "2026-07-25T12:00:00.000Z",
      "x-ropay-provider-reference": "RPI-1",
    });
    await controller.handleRoPayCallback(ctx);

    assert.equal(ctx.status, 429);
    assert.deepEqual(ctx.body, { error: "Request could not be completed." });
    assert.deepEqual(ctx.responseHeaders, { "Retry-After": "17" });
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.ropay === undefined) delete process.env.ROPAY_ENABLED;
    else process.env.ROPAY_ENABLED = previous.ropay;
  }
});

test("browser return is authenticated, read-only, and exposes status only", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    ropay: process.env.ROPAY_ENABLED,
    storefront: process.env.JAMORA_STOREFRONT_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.ROPAY_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
  let readInput;
  installStrapi({
    async readRoPayStatus(input) {
      readInput = input;
      return {
        method: "ropay",
        status: "pending_provider",
        paymentReference: "JMR-ROPAY-1",
        amountMinor: 10_000,
        currency: "RON",
        expiresAt: "2026-07-25T12:10:00.000Z",
        settlementKey: "never-expose",
      };
    },
    async handleRoPayCallback() {
      assert.fail("browser return must not call settlement");
    },
    async verifyRoPayStatus() {
      assert.fail("browser return must not call server status verification");
    },
  }, { documentId: "customer-1", sessionVersion: 4 });
  try {
    const ctx = context({}, {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "4",
    }, { reference: "JMR-ROPAY-1" });
    ctx.request.method = "GET";
    await controller.readRoPayReturn(ctx);
    assert.deepEqual(readInput, {
      paymentReference: "JMR-ROPAY-1",
      customerDocumentId: "customer-1",
      guestCheckoutCapability: undefined,
    });
    assert.deepEqual(ctx.body, {
      method: "ropay",
      status: "pending_provider",
      paymentReference: "JMR-ROPAY-1",
      amountMinor: 10_000,
      currency: "RON",
      expiresAt: "2026-07-25T12:10:00.000Z",
    });
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.ropay === undefined) delete process.env.ROPAY_ENABLED;
    else process.env.ROPAY_ENABLED = previous.ropay;
    if (previous.storefront === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefront;
  }
});

test("customer status route is read-only for manual and RoPay and returns safe snapshots", async () => {
  const previous = {
    payments: process.env.PAYMENTS_ENABLED,
    storefront: process.env.JAMORA_STOREFRONT_API_SECRET,
  };
  process.env.PAYMENTS_ENABLED = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
  const reads = [];
  installStrapi({
    async readPaymentStatus(input) {
      reads.push(input);
      return input.paymentReference === "JMR-BANK-1"
        ? {
            method: "bank_transfer",
            status: "awaiting_payment",
            paymentReference: "JMR-BANK-1",
            amountMinor: 5_000,
            currency: "EUR",
            expiresAt: "2026-07-28T12:10:00.000Z",
            priceSnapshot: {
              bankTransfer: {
                name: "Jamora SRL",
                iban: "RO49AAAA1B31007593840000",
                bank: "Jamora Bank",
                internalAccountId: "never-expose",
              },
              internal: "never-expose",
            },
            settlementKey: "never-expose",
          }
        : {
            method: "ropay",
            status: "paid",
            paymentReference: "JMR-ROPAY-1",
            amountMinor: 10_000,
            currency: "RON",
            expiresAt: "2026-07-25T12:10:00.000Z",
            providerReference: "never-expose",
            priceSnapshot: { ropay: { sessionToken: "never-expose" } },
          };
    },
  }, { documentId: "customer-1", sessionVersion: 4 });
  try {
    const bank = context({}, {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-checkout-capability": "reservation-1",
    }, { reference: "JMR-BANK-1" });
    bank.request.method = "GET";
    await controller.readPaymentStatus(bank);
    assert.deepEqual(bank.body, {
      method: "bank_transfer",
      status: "awaiting_payment",
      paymentReference: "JMR-BANK-1",
      amountMinor: 5_000,
      currency: "EUR",
      expiresAt: "2026-07-28T12:10:00.000Z",
      beneficiary: {
        name: "Jamora SRL",
        iban: "RO49AAAA1B31007593840000",
        bank: "Jamora Bank",
      },
    });
    assert.deepEqual(reads[0], {
      paymentReference: "JMR-BANK-1",
      customerDocumentId: undefined,
      guestCheckoutCapability: "reservation-1",
    });

    const ropay = context({}, {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "4",
    }, { reference: "JMR-ROPAY-1" });
    ropay.request.method = "GET";
    await controller.readPaymentStatus(ropay);
    assert.deepEqual(ropay.body, {
      method: "ropay",
      status: "paid",
      paymentReference: "JMR-ROPAY-1",
      amountMinor: 10_000,
      currency: "RON",
      expiresAt: "2026-07-25T12:10:00.000Z",
    });
  } finally {
    if (previous.payments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = previous.payments;
    if (previous.storefront === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefront;
  }
});

test("routes separate provider mutation from browser read-only return", () => {
  const byHandler = Object.fromEntries(
    routes.routes.map((route) => [route.handler, route]),
  );
  assert.deepEqual(
    [byHandler["payment-operations.prepareRoPay"].method,
      byHandler["payment-operations.handleRoPayCallback"].method,
      byHandler["payment-operations.verifyRoPayStatus"].method,
      byHandler["payment-operations.readRoPayReturn"].method,
      byHandler["payment-operations.readPaymentStatus"].method],
    ["POST", "POST", "POST", "GET", "GET"],
  );
  assert.match(
    byHandler["payment-operations.readRoPayReturn"].path,
    /:reference$/,
  );
  assert.equal(
    byHandler["payment-operations.readPaymentStatus"].path,
    "/jamora/payments/status/:reference",
  );
});

test("owner reconciliation list is a GET-only custom route", () => {
  const route = routes.routes.find((candidate) =>
    candidate.handler === "payment-operations.listAdminPayments",
  );
  assert.deepEqual(route && [route.method, route.path], ["GET", "/jamora/admin/payments"]);
});
