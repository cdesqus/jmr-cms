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
    items: [{ slug: "jamu", qty: 1 }],
    statusHistory: [],
  };
  const ordinaryAdapter = {
    lockOrder: async () => structuredClone(order),
    assertBinding: () => undefined,
    consumeReservation: async () => calls.push("reservation"),
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
