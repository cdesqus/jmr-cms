import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  createMemoryPaymentAdapter,
  createPaymentSubjectSettlement,
  createPaymentTransactions,
} from "./services/payment-transaction.cjs";
import {
  createMemoryMembershipAdapter,
  createMembershipTransactions,
} from "../membership-operations/services/membership-transaction.cjs";
import { settleOrdinaryOrder } from "./services/order-payment-settlement.cjs";
import {
  canonicalRoPayPayload,
  createRoPayIntent,
  handleRoPayCallback,
  readRoPayStatus,
} from "./services/ropay-adapter.cjs";
import paymentControllers from "./controllers/payment-operations.ts";

const now = new Date("2026-07-25T12:00:00.000Z");
const beneficiary = {
  name: "Jamora SRL",
  iban: "RO49AAAA1B31007593840000",
  bank: "Banca Jamora",
};
const ropaySecret = "test-only-ropay-callback-secret-32-bytes";
const paymentEnv = { PAYMENTS_ENABLED: "true" };
const ropayEnv = {
  ...paymentEnv,
  ROPAY_ENABLED: "true",
  ROPAY_PROVIDER_MODE: "mock",
  ROPAY_CALLBACK_SECRET: ropaySecret,
  ROPAY_INTENT_TTL_SECONDS: "600",
};

function paymentInput(overrides = {}) {
  return {
    idempotencyKey: "payment:order-1",
    subjectType: "order",
    subjectId: "order-1",
    ownerDocumentId: "customer-1",
    customerDocumentId: "customer-1",
    purpose: "order",
    amountMinor: 10_000,
    currency: "RON",
    priceSnapshot: { charge: { amountMinor: 10_000, currency: "RON" } },
    now,
    ...overrides,
  };
}

function signedRoPay(payload, kind = "callback", timestamp = now.toISOString()) {
  const message = `ropay-${kind}\n${timestamp}\n${canonicalRoPayPayload(payload)}`;
  return {
    payload,
    timestamp,
    providerReference: payload.providerReference,
    signature: `sha256=${createHmac("sha256", ropaySecret).update(message).digest("hex")}`,
  };
}

function controllerContext({ body = {}, headers = {}, params = {} } = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    request: { body },
    params,
    status: 200,
    body: undefined,
    get(name) { return normalized[name.toLowerCase()] ?? ""; },
    set(name, value) {
      this.responseHeaders = { ...(this.responseHeaders ?? {}), [name]: value };
    },
  };
}

async function withControllerRuntime(work) {
  const saved = Object.fromEntries([
    "PAYMENTS_ENABLED", "ROPAY_ENABLED", "ROPAY_PROVIDER_MODE",
    "ROPAY_CALLBACK_SECRET", "JAMORA_STOREFRONT_API_SECRET",
    "JAMORA_ADMIN_API_SECRET",
  ].map((name) => [name, process.env[name]]));
  const savedStrapi = globalThis.strapi;
  try {
    Object.assign(process.env, {
      PAYMENTS_ENABLED: "true",
      ROPAY_ENABLED: "true",
      ROPAY_PROVIDER_MODE: "mock",
      ROPAY_CALLBACK_SECRET: ropaySecret,
      JAMORA_STOREFRONT_API_SECRET: "storefront-secret",
      JAMORA_ADMIN_API_SECRET: "owner-secret",
    });
    await work();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    globalThis.strapi = savedStrapi;
  }
}

test("manual transfer mismatch is recorded, owner resolution settles once, and exact receipt settles once", async () => {
  let settlements = 0;
  const adapter = createMemoryPaymentAdapter();
  const payments = createPaymentTransactions(adapter, {
    env: paymentEnv,
    beneficiary,
    settleSubject: async () => { settlements += 1; },
  });

  const mismatch = await payments.prepareBankTransfer(paymentInput());
  const underpaid = await payments.recordBankReceipt({
    paymentDocumentId: mismatch.documentId,
    amountMinor: 9_000,
    currency: "RON",
    receivedAt: now,
    actor: "owner@example.test",
    providerEventId: "receipt:underpaid",
  });
  assert.equal(underpaid.status, "underpaid");
  assert.equal(settlements, 0);
  await assert.rejects(
    payments.recordBankReceipt({
      paymentDocumentId: mismatch.documentId,
      amountMinor: 10_000,
      currency: "RON",
      receivedAt: now,
      actor: "owner@example.test",
      providerEventId: "receipt:replacement",
    }),
    /owner resolution is required/i,
  );

  const resolved = await payments.resolvePaymentMismatch({
    paymentDocumentId: mismatch.documentId,
    actor: "owner@example.test",
    reason: "Accept verified partial transfer.",
    idempotencyKey: "resolution:underpaid",
    occurredAt: "2026-07-25T12:01:00.000Z",
  });
  assert.equal(resolved.status, "paid");
  assert.equal((await payments.resolvePaymentMismatch({
    paymentDocumentId: mismatch.documentId,
    actor: "owner@example.test",
    reason: "Accept verified partial transfer.",
    idempotencyKey: "resolution:underpaid",
    occurredAt: "2026-07-25T12:01:00.000Z",
  })).idempotent, true);

  const exact = await payments.prepareBankTransfer(paymentInput({
    idempotencyKey: "payment:order-2",
    subjectId: "order-2",
  }));
  const receipt = {
    paymentDocumentId: exact.documentId,
    amountMinor: 10_000,
    currency: "RON",
    receivedAt: "2026-07-25T12:02:00.000Z",
    actor: "owner@example.test",
    providerEventId: "receipt:exact",
  };
  assert.equal((await payments.recordBankReceipt(receipt)).status, "paid");
  assert.equal((await payments.recordBankReceipt(receipt)).idempotent, true);
  assert.equal(settlements, 2);
});

test("signed RoPay callback settles once; replay, bad signature, browser return, and expiry cannot add settlement", async () => {
  let settlements = 0;
  const subject = paymentInput({ idempotencyKey: "ropay:order-1" });
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async () => subject,
    settleSubject: async () => { settlements += 1; },
  });
  const intent = await createRoPayIntent(adapter, subject, {
    env: ropayEnv,
    randomUUID: (() => {
      let value = 0;
      return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
    })(),
  });
  const stored = [...adapter.payments.values()][0];
  const expiredTemplate = structuredClone(stored);
  const callbackPayload = {
    providerEventId: "ropay:event-1",
    providerReference: stored.providerReference,
    paymentReference: intent.paymentReference,
    status: "paid",
    amountMinor: intent.amountMinor,
    currency: "RON",
    occurredAt: "2026-07-25T12:00:01.000Z",
  };

  assert.equal(
    (await readRoPayStatus(adapter, {
      paymentReference: intent.paymentReference,
      customerDocumentId: "customer-1",
    }, { env: ropayEnv })).status,
    "pending_provider",
  );
  assert.equal(settlements, 0);
  assert.equal(
    (await handleRoPayCallback(adapter, signedRoPay(callbackPayload), {
      env: ropayEnv,
      now: () => now,
    })).idempotent,
    false,
  );
  assert.equal(
    (await handleRoPayCallback(adapter, signedRoPay(callbackPayload), {
      env: ropayEnv,
      now: () => now,
    })).idempotent,
    true,
  );
  await assert.rejects(
    handleRoPayCallback(adapter, {
      ...signedRoPay({ ...callbackPayload, providerEventId: "ropay:event-invalid" }),
      signature: `sha256=${"0".repeat(64)}`,
    }, { env: ropayEnv, now: () => now }),
    /signature verification failed/i,
  );
  assert.equal(settlements, 1);

  const expiredAdapter = createMemoryPaymentAdapter({
    payments: [{
      ...expiredTemplate,
      documentId: "payment:expired",
      idempotencyKey: "ropay:expired",
      paymentReference: "JMR-ROPAY-EXPIRED",
      providerReference: "RPI-EXPIRED",
      expiresAt: "2026-07-25T11:59:59.000Z",
    }],
  });
  const expiredPayload = {
    ...callbackPayload,
    providerEventId: "ropay:event-expired",
    providerReference: "RPI-EXPIRED",
    paymentReference: "JMR-ROPAY-EXPIRED",
  };
  await assert.rejects(
    handleRoPayCallback(expiredAdapter, signedRoPay(expiredPayload), {
      env: ropayEnv,
      now: () => now,
    }),
    /expired/i,
  );
});

test("paid payment subjects activate a membership and finalize an ordinary order exactly once", async () => {
  const membershipAdapter = createMemoryMembershipAdapter({ memberships: [{
    documentId: "membership-1",
    customerDocumentId: "customer-1",
    status: "pending_payment",
    startsAt: null,
    endsAt: null,
    cachedRemainingCredits: 0,
    planSnapshot: { packageCredits: 3, durationMonths: 3 },
  }] });
  const membershipOperations = createMembershipTransactions(
    membershipAdapter,
    { MEMBERSHIP_ENABLED: "true" },
  );
  const calls = [];
  const order = {
    documentId: "order-1",
    orderNumber: "JMR-2026-1",
    status: "pending",
    reservationToken: "reservation-1",
    items: [{ productId: "product-jamu", slug: "jamu", qty: 1 }],
    statusHistory: [],
  };
  const ordinaryAdapter = {
    lockOrder: async () => structuredClone(order),
    assertBinding: () => undefined,
    consumeReservation: async () => {
      calls.push("reservation");
      return [{
        productDocumentId: "product-jamu",
        slug: "jamu",
        qty: 1,
      }];
    },
    decrementProductStock: async () => calls.push("stock"),
    incrementPromotionUse: async () => undefined,
    updateOrder: async (_id, data) => ({ ...order, ...data }),
  };
  const settleSubject = createPaymentSubjectSettlement({
    activateMembership: membershipOperations.activateMembership,
    settleOrder: (payment) => settleOrdinaryOrder(ordinaryAdapter, payment),
    finalizeMembershipCheckout: async () => assert.fail("ordinary settlement has no membership checkout"),
  });
  const adapter = createMemoryPaymentAdapter({ settleSubject });
  const payments = createPaymentTransactions(adapter, { env: paymentEnv, beneficiary });

  const membershipPayment = await payments.prepareBankTransfer(paymentInput({
    idempotencyKey: "payment:membership-1",
    subjectType: "membership",
    subjectId: "membership-1",
    purpose: "membership_purchase",
    membershipDocumentId: "membership-1",
  }));
  await payments.recordBankReceipt({
    paymentDocumentId: membershipPayment.documentId,
    amountMinor: 10_000,
    currency: "RON",
    receivedAt: now,
    actor: "owner@example.test",
    providerEventId: "receipt:membership-1",
  });
  assert.equal(membershipAdapter.memberships.get("membership-1").status, "active");
  assert.equal(membershipAdapter.entries.filter((entry) => entry.kind === "grant").length, 1);

  const ordinaryPayment = await payments.prepareBankTransfer(paymentInput({
    idempotencyKey: "payment:ordinary-1",
    orderDocumentId: "order-1",
  }));
  const receipt = {
    paymentDocumentId: ordinaryPayment.documentId,
    amountMinor: 10_000,
    currency: "RON",
    receivedAt: now,
    actor: "owner@example.test",
    providerEventId: "receipt:ordinary-1",
  };
  await payments.recordBankReceipt(receipt);
  await payments.recordBankReceipt(receipt);
  assert.deepEqual(calls, ["reservation", "stock"]);
});

test("payment and membership surfaces fail closed unless their feature flags are exactly true", async () => {
  const adapter = createMemoryPaymentAdapter();
  const payments = createPaymentTransactions(adapter, { env: { PAYMENTS_ENABLED: "TRUE" }, beneficiary });
  await assert.rejects(payments.prepareBankTransfer(paymentInput()), /not found/i);
  await assert.rejects(
    createRoPayIntent(adapter, paymentInput(), { env: { ...ropayEnv, ROPAY_ENABLED: "TRUE" } }),
    /not found/i,
  );
  const memberships = createMembershipTransactions(
    createMemoryMembershipAdapter({ memberships: [] }),
    { MEMBERSHIP_ENABLED: "1" },
  );
  await assert.rejects(
    memberships.activateMembership({ membershipId: "membership-1", paymentDocumentId: "payment-1", idempotencyKey: "activate:1" }),
    /not found/i,
  );
});

test("controller smoke binds customer, guest, and owner boundaries through verified Phase 2 settlement", async () => {
  await withControllerRuntime(async () => {
    const orders = new Map([
      ["order-under", { documentId: "order-under", orderNumber: "JMR-UNDER", status: "pending", reservationToken: "reserve-under", items: [{ productId: "product-jamu", slug: "jamu", qty: 1 }], statusHistory: [] }],
      ["order-exact", { documentId: "order-exact", orderNumber: "JMR-EXACT", status: "pending", reservationToken: "reserve-exact", promotionCode: "WELCOME", items: [{ productId: "product-jamu", slug: "jamu", qty: 1 }], statusHistory: [] }],
      ["ropay-order", { documentId: "ropay-order", orderNumber: "JMR-ROPAY", status: "pending", reservationToken: "reserve-ropay", items: [{ productId: "product-jamu", slug: "jamu", qty: 1 }], statusHistory: [] }],
    ]);
    const inventory = [];
    const membershipAdapter = createMemoryMembershipAdapter({ memberships: [{
      documentId: "membership-controller",
      customerDocumentId: "customer-1",
      status: "pending_payment",
      startsAt: null,
      endsAt: null,
      cachedRemainingCredits: 0,
      planSnapshot: { packageCredits: 3, durationMonths: 3 },
    }] });
    const membershipOperations = createMembershipTransactions(
      membershipAdapter,
      { MEMBERSHIP_ENABLED: "true" },
    );
    const settlement = createPaymentSubjectSettlement({
      activateMembership: membershipOperations.activateMembership,
      settleOrder: (payment) => settleOrdinaryOrder({
        lockOrder: async (documentId) => structuredClone(orders.get(documentId)),
        assertBinding: () => undefined,
        consumeReservation: async (token) => {
          inventory.push(`reserve:${token}`);
          return [{
            productDocumentId: "product-jamu",
            slug: "jamu",
            qty: 1,
          }];
        },
        decrementProductStock: async (_items, reference) => inventory.push(`stock:${reference}`),
        incrementPromotionUse: async (code) => inventory.push(`promotion:${code}`),
        updateOrder: async (documentId, patch) => {
          const updated = { ...orders.get(documentId), ...patch };
          orders.set(documentId, updated);
          return updated;
        },
      }, payment),
      finalizeMembershipCheckout: async () => assert.fail("controller fixture has no membership checkout"),
    });
    const base = createMemoryPaymentAdapter({
      resolvePaymentSubject: async (input) => ({
        ...input,
        ownerDocumentId: input.customerDocumentId || `guest:${input.guestCheckoutCapability}`,
      }),
      settleSubject: settlement,
    });
    let transactions = 0;
    const adapter = {
      ...base,
      transaction: async (work) => {
        transactions += 1;
        return base.transaction(work);
      },
    };
    const transfers = createPaymentTransactions(adapter, { env: paymentEnv, beneficiary });
    const paymentService = {
      prepareBankTransfer: (input) => transfers.prepareBankTransfer(input),
      recordBankReceipt: (input) => transfers.recordBankReceipt(input),
      resolvePaymentMismatch: (input) => transfers.resolvePaymentMismatch(input),
      expireDuePayments: (at, limit) => transfers.expireDuePayments(at, limit),
      createRoPayIntent: (input) => createRoPayIntent(adapter, input, { env: ropayEnv }),
      handleRoPayCallback: (input) => handleRoPayCallback(adapter, input, { env: ropayEnv, now: () => now }),
      verifyRoPayStatus: (input) => handleRoPayCallback(adapter, input, { env: ropayEnv, now: () => now, verification: "status" }),
      readRoPayStatus: (input) => readRoPayStatus(adapter, input, { env: ropayEnv }),
      readPaymentStatus: async (input) => {
        const payment = await adapter.findPaymentByReference(input.paymentReference);
        if (!payment || payment.ownerDocumentId !== (input.customerDocumentId || `guest:${input.guestCheckoutCapability}`)) {
          throw new Error("Payment not found.");
        }
        return payment;
      },
      listAdminPayments: async () => [],
    };
    globalThis.strapi = {
      service(uid) {
        if (uid === "api::payment-operations.payment-operations") return paymentService;
        if (uid === "api::customer-auth.customer-auth") {
          return { findActiveSessionCustomer: async (id, version) =>
            id === "customer-1" && version === 0 ? { documentId: id } : null };
        }
        throw new Error(`Unexpected service ${uid}`);
      },
    };
    const customerHeaders = {
      "x-jamora-storefront-secret": "storefront-secret",
      "x-jamora-customer-document-id": "customer-1",
      "x-jamora-customer-session-version": "0",
    };
    const ownerHeaders = {
      "x-jamora-admin-secret": "owner-secret",
      "x-jamora-admin-actor": "owner@example.test",
      "x-jamora-admin-role": "owner",
    };
    const prepare = (subjectId, extra = {}) => controllerContext({
      headers: customerHeaders,
      body: {
        ...paymentInput({ subjectId, orderDocumentId: subjectId, idempotencyKey: `controller:${subjectId}` }),
        ...extra,
      },
    });

    const under = prepare("order-under");
    await paymentControllers.prepareBankTransfer(under);
    assert.equal(under.status, 200);
    const underPayment = [...base.payments.values()].find((payment) => payment.subjectId === "order-under");
    const underReceipt = controllerContext({
      headers: ownerHeaders,
      params: { documentId: underPayment.documentId },
      body: { amountMinor: 9_000, currency: "RON", providerEventId: "controller:under", receivedAt: now.toISOString() },
    });
    await paymentControllers.recordBankReceipt(underReceipt);
    assert.equal(underReceipt.body.status, "underpaid");
    assert.equal(orders.get("order-under").status, "pending");
    const resolved = controllerContext({
      headers: ownerHeaders,
      params: { documentId: underPayment.documentId },
      body: { idempotencyKey: "controller:resolve-under", reason: "Accept verified partial transfer.", occurredAt: "2026-07-25T12:01:00.000Z" },
    });
    await paymentControllers.resolvePaymentMismatch(resolved);
    assert.equal(resolved.body.status, "paid");
    assert.equal(orders.get("order-under").status, "paid");

    const exact = prepare("order-exact");
    await paymentControllers.prepareBankTransfer(exact);
    const exactPayment = [...base.payments.values()].find((payment) => payment.subjectId === "order-exact");
    const exactReceipt = controllerContext({
      headers: ownerHeaders,
      params: { documentId: exactPayment.documentId },
      body: { amountMinor: 10_000, currency: "RON", providerEventId: "controller:exact", receivedAt: "2026-07-25T12:02:00.000Z" },
    });
    await paymentControllers.recordBankReceipt(exactReceipt);
    const paidOrder = orders.get("order-exact");
    assert.equal(paidOrder.status, "paid");
    assert.equal(paidOrder.invoiceNumber, "INV-EXACT");
    assert.equal(paidOrder.statusHistory.at(-1).type, "status");
    assert.deepEqual(inventory, [
      "reserve:reserve-under", "stock:JMR-UNDER",
      "reserve:reserve-exact", "stock:JMR-EXACT", "promotion:WELCOME",
    ]);

    for (const [suffix, amountMinor, currency, status] of [
      ["over", 11_000, "RON", "overpaid"],
      ["currency", 10_000, "EUR", "currency_mismatch"],
    ]) {
      const guest = controllerContext({
        headers: { "x-jamora-storefront-secret": "storefront-secret", "x-jamora-checkout-capability": `guest-${suffix}` },
        body: { ...paymentInput({ idempotencyKey: `controller:guest:${suffix}`, subjectId: `guest-${suffix}`, ownerDocumentId: undefined, customerDocumentId: undefined }), guestCheckoutCapability: `guest-${suffix}` },
      });
      await paymentControllers.prepareBankTransfer(guest);
      const guestPayment = [...base.payments.values()].find((payment) => payment.subjectId === `guest-${suffix}`);
      const receipt = controllerContext({ headers: ownerHeaders, params: { documentId: guestPayment.documentId }, body: { amountMinor, currency, providerEventId: `controller:${suffix}`, receivedAt: now.toISOString() } });
      await paymentControllers.recordBankReceipt(receipt);
      assert.equal(receipt.body.status, status);
    }

    const membership = prepare("membership-controller", {
      idempotencyKey: "controller:membership",
      subjectType: "membership",
      purpose: "membership_purchase",
      membershipDocumentId: "membership-controller",
      orderDocumentId: undefined,
    });
    await paymentControllers.prepareBankTransfer(membership);
    const membershipPayment = [...base.payments.values()].find((payment) => payment.subjectId === "membership-controller");
    await paymentControllers.recordBankReceipt(controllerContext({ headers: ownerHeaders, params: { documentId: membershipPayment.documentId }, body: { amountMinor: 10_000, currency: "RON", providerEventId: "controller:membership", receivedAt: now.toISOString() } }));
    assert.equal(membershipAdapter.memberships.get("membership-controller").status, "active");

    const ropay = prepare("ropay-order", { idempotencyKey: "controller:ropay", currency: "RON" });
    await paymentControllers.prepareRoPay(ropay);
    const ropayPayment = [...base.payments.values()].find((payment) => payment.subjectId === "ropay-order");
    transactions = 0;
    const browserReturn = controllerContext({ headers: customerHeaders, params: { reference: ropay.body.paymentReference } });
    await paymentControllers.readRoPayReturn(browserReturn);
    assert.equal(browserReturn.body.status, "pending_provider");
    assert.equal(transactions, 0);
    const callbackOccurredAt = new Date(
      Date.parse(ropayPayment.expiresAt) - 2_000,
    ).toISOString();
    const providerPayload = {
      providerEventId: "controller:ropay-event",
      providerReference: ropayPayment.providerReference,
      paymentReference: ropayPayment.paymentReference,
      status: "paid",
      amountMinor: 10_000,
      currency: "RON",
      occurredAt: callbackOccurredAt,
    };
    const invalid = controllerContext({ headers: { "x-ropay-signature": `sha256=${"0".repeat(64)}`, "x-ropay-timestamp": now.toISOString(), "x-ropay-provider-reference": ropayPayment.providerReference }, body: providerPayload });
    await paymentControllers.handleRoPayCallback(invalid);
    assert.equal(invalid.status, 401);
    const signedCallback = signedRoPay(providerPayload);
    const callback = controllerContext({ headers: {
      "x-ropay-signature": signedCallback.signature,
      "x-ropay-timestamp": signedCallback.timestamp,
      "x-ropay-provider-reference": signedCallback.providerReference,
    }, body: providerPayload });
    await paymentControllers.handleRoPayCallback(callback);
    assert.deepEqual(callback.body, { accepted: true, status: "paid", idempotent: false });
    const statusPayload = {
      ...providerPayload,
      providerEventId: "controller:ropay-status",
      occurredAt: new Date(Date.parse(ropayPayment.expiresAt) - 1_000).toISOString(),
    };
    const status = signedRoPay(statusPayload, "status");
    const signedStatus = controllerContext({ headers: { "x-ropay-signature": status.signature, "x-ropay-timestamp": status.timestamp, "x-ropay-provider-reference": status.providerReference }, body: statusPayload });
    await paymentControllers.verifyRoPayStatus(signedStatus);
    assert.deepEqual(signedStatus.body, { accepted: true, status: "paid", idempotent: true });
  });
});

test("controller feature-off gates hide bank and RoPay surfaces before identity or service work", async () => {
  const savedPayments = process.env.PAYMENTS_ENABLED;
  const savedRoPay = process.env.ROPAY_ENABLED;
  const savedStrapi = globalThis.strapi;
  try {
    process.env.PAYMENTS_ENABLED = "false";
    process.env.ROPAY_ENABLED = "false";
    globalThis.strapi = { service: () => assert.fail("feature-off must not resolve services") };
    for (const handler of [
      paymentControllers.prepareBankTransfer,
      paymentControllers.prepareRoPay,
      paymentControllers.handleRoPayCallback,
      paymentControllers.readRoPayReturn,
    ]) {
      const ctx = controllerContext({
        headers: { "x-jamora-storefront-secret": "storefront-secret" },
        params: { reference: "JMR-ROPAY-1" },
      });
      await handler(ctx);
      assert.equal(ctx.status, 404);
      assert.deepEqual(ctx.body, { error: "Not found." });
    }
  } finally {
    if (savedPayments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = savedPayments;
    if (savedRoPay === undefined) delete process.env.ROPAY_ENABLED;
    else process.env.ROPAY_ENABLED = savedRoPay;
    globalThis.strapi = savedStrapi;
  }
});
