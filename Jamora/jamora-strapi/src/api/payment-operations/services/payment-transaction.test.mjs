import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOrderPaymentBinding,
  beneficiaryFromEnv,
  createMemoryPaymentAdapter,
  createPaymentSubjectSettlement,
  createPaymentTransactions,
  createStrapiPaymentAdapter,
  deriveAuthoritativePaymentSubject,
  validateGuestCheckoutCapability,
} from "./payment-transaction.cjs";

const enabled = { PAYMENTS_ENABLED: "true" };
const now = new Date("2026-07-25T08:00:00.000Z");
const beneficiary = {
  name: "Jamora SRL",
  iban: "RO49AAAA1B31007593840000",
  bank: "Banca Jamora",
};

function input(overrides = {}) {
  return {
    idempotencyKey: "prepare:order:reservation-1",
    subjectType: "order",
    subjectId: "reservation-1",
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

function operations(options = {}) {
  const adapter = createMemoryPaymentAdapter(options);
  const service = createPaymentTransactions(adapter, {
    env: enabled,
    beneficiary,
    randomUUID: (() => {
      let value = 0;
      return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
    })(),
    ...options,
  });
  return { adapter, service };
}

test("duplicate preparation returns one immutable bank transfer attempt", async () => {
  const { adapter, service } = operations();

  const first = await service.prepareBankTransfer(input());
  const second = await service.prepareBankTransfer(input());

  assert.equal(second.documentId, first.documentId);
  assert.equal(second.idempotent, true);
  assert.equal(adapter.payments.size, 1);
  assert.equal(first.status, "awaiting_payment");
  assert.equal(first.method, "bank_transfer");
  assert.equal(first.provider, "manual");
  assert.match(first.paymentReference, /^JMR-[A-Z0-9-]+$/);
  assert.equal(first.expiresAt, "2026-07-28T08:00:00.000Z");
  assert.deepEqual(first.priceSnapshot.bankTransfer, beneficiary);
  beneficiary.name = "Changed after preparation";
  assert.equal(first.priceSnapshot.bankTransfer.name, "Jamora SRL");
  beneficiary.name = "Jamora SRL";
  assert.equal(adapter.events.length, 1);
  assert.equal(adapter.events[0].transition, "awaiting_payment");

  await assert.rejects(
    service.prepareBankTransfer(input({ amountMinor: 9_999 })),
    /idempotency conflict/i,
  );
});

test("authoritative preparation replay rejects a currency change", async () => {
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async (requested) => deriveAuthoritativePaymentSubject(
      requested,
      {
        documentId: "membership-1",
        customerDocumentId: "customer-1",
        status: "pending_payment",
        planSnapshot: {
          priceEurMinor: 2_000,
          priceRonMinor: 10_000,
        },
      },
      null,
      now,
    ),
  });
  const service = createPaymentTransactions(adapter, {
    env: enabled,
    beneficiary,
  });
  const requested = {
    idempotencyKey: "prepare:membership-1",
    subjectType: "membership",
    subjectId: "membership-1",
    customerDocumentId: "customer-1",
    purpose: "membership_purchase",
    currency: "RON",
    now,
  };
  await service.prepareBankTransfer(requested);
  await assert.rejects(
    service.prepareBankTransfer({ ...requested, currency: "EUR" }),
    /idempotency conflict/i,
  );
});

test("an exact receipt settles the subject once and receipt replay is idempotent", async () => {
  let settlements = 0;
  const { adapter, service } = operations({
    settleSubject: async () => { settlements += 1; },
  });
  const payment = await service.prepareBankTransfer(input());
  const receipt = {
    paymentDocumentId: payment.documentId,
    amountMinor: 10_000,
    currency: "RON",
    receivedAt: new Date("2026-07-25T09:00:00.000Z"),
    actor: "owner@example.test",
    providerEventId: "bank-receipt-1",
    bankReference: "BANK-0001",
  };

  const first = await service.recordBankReceipt(receipt);
  const second = await service.recordBankReceipt(receipt);

  assert.equal(first.status, "paid");
  assert.equal(first.settlementKey, `payment:${payment.documentId}:settle`);
  assert.equal(first.receivedAmountMinor, 10_000);
  assert.equal(first.receivedCurrency, "RON");
  assert.equal(second.idempotent, true);
  assert.equal(settlements, 1);
  assert.equal(adapter.events.filter((event) => event.providerEventId === "bank-receipt-1").length, 1);
  await assert.rejects(
    service.recordBankReceipt({
      ...receipt,
      actor: "different-owner@example.test",
    }),
    /idempotency conflict/i,
  );
  await assert.rejects(
    service.recordBankReceipt({
      ...receipt,
      amountMinor: 9_999,
      providerEventId: "bank-receipt-2",
    }),
    /already settled/i,
  );
});

test("underpayment, overpayment, and currency mismatch record receipt without settlement", async () => {
  for (const [suffix, receipt, expectedStatus] of [
    ["under", { amountMinor: 9_000, currency: "RON" }, "underpaid"],
    ["over", { amountMinor: 11_000, currency: "RON" }, "overpaid"],
    ["currency", { amountMinor: 10_000, currency: "EUR" }, "currency_mismatch"],
  ]) {
    let settlements = 0;
    const { adapter, service } = operations({
      settleSubject: async () => { settlements += 1; },
    });
    const payment = await service.prepareBankTransfer(input({ idempotencyKey: `prepare:${suffix}` }));

    const result = await service.recordBankReceipt({
      paymentDocumentId: payment.documentId,
      ...receipt,
      receivedAt: now,
      actor: "owner@example.test",
      providerEventId: `receipt:${suffix}`,
    });

    assert.equal(result.status, expectedStatus);
    assert.equal(result.receivedAmountMinor, receipt.amountMinor);
    assert.equal(result.receivedCurrency, receipt.currency);
    assert.equal(result.settlementKey, undefined);
    assert.equal(settlements, 0);
    assert.equal(adapter.events.at(-1).transition, expectedStatus);
    await assert.rejects(
      service.recordBankReceipt({
        paymentDocumentId: payment.documentId,
        amountMinor: 10_000,
        currency: "RON",
        receivedAt: now,
        actor: "owner@example.test",
        providerEventId: `receipt:${suffix}:replacement`,
      }),
      /owner resolution is required/i,
    );
  }
});

test("owner resolution requires a reason and actor before settling a mismatch once", async () => {
  let settlements = 0;
  const { adapter, service } = operations({
    settleSubject: async () => { settlements += 1; },
  });
  const payment = await service.prepareBankTransfer(input());
  await service.recordBankReceipt({
    paymentDocumentId: payment.documentId,
    amountMinor: 9_000,
    currency: "RON",
    receivedAt: now,
    actor: "owner@example.test",
    providerEventId: "receipt:under",
  });

  await assert.rejects(
    service.resolvePaymentMismatch({
      paymentDocumentId: payment.documentId,
      actor: "owner@example.test",
      reason: " ",
      idempotencyKey: "resolution:under",
    }),
    /reason is required/i,
  );
  await assert.rejects(
    service.resolvePaymentMismatch({
      paymentDocumentId: payment.documentId,
      actor: "",
      reason: "Accept partial payment",
      idempotencyKey: "resolution:under",
    }),
    /actor is required/i,
  );

  const first = await service.resolvePaymentMismatch({
    paymentDocumentId: payment.documentId,
    actor: "owner@example.test",
    reason: "Accept partial payment",
    idempotencyKey: "resolution:under",
    occurredAt: "2026-07-25T10:00:00.000Z",
  });
  const second = await service.resolvePaymentMismatch({
    paymentDocumentId: payment.documentId,
    actor: "owner@example.test",
    reason: "Accept partial payment",
    idempotencyKey: "resolution:under",
    occurredAt: "2026-07-25T10:00:00.000Z",
  });

  assert.equal(first.status, "paid");
  assert.equal(second.idempotent, true);
  assert.equal(settlements, 1);
  assert.deepEqual(
    adapter.events.filter((event) => event.providerEventId === "resolution:under")
      .map(({ transition, actor, reason }) => ({ transition, actor, reason })),
    [{ transition: "paid", actor: "owner@example.test", reason: "Accept partial payment" }],
  );
  await assert.rejects(
    service.resolvePaymentMismatch({
      paymentDocumentId: payment.documentId,
      actor: "owner@example.test",
      reason: "Accept partial payment",
      idempotencyKey: "resolution:under",
      occurredAt: "2026-07-25T10:00:01.000Z",
    }),
    /idempotency conflict/i,
  );
});

test("expiry sweep is bounded, row-authoritative, and idempotent", async () => {
  const { adapter, service } = operations();
  const dueAt = new Date("2026-07-29T08:00:00.000Z");
  for (let index = 1; index <= 3; index += 1) {
    await service.prepareBankTransfer(input({
      idempotencyKey: `prepare:${index}`,
      subjectId: `reservation-${index}`,
    }));
  }

  assert.equal(await service.expireDuePayments(dueAt, 2), 2);
  assert.equal(await service.expireDuePayments(dueAt, 2), 1);
  assert.equal(await service.expireDuePayments(dueAt, 2), 0);
  assert.equal([...adapter.payments.values()].filter((payment) => payment.status === "expired").length, 3);
  assert.equal(adapter.events.filter((event) => event.transition === "expired").length, 3);
  await assert.rejects(service.expireDuePayments(dueAt, 0), /positive safe integer/i);
});

test("mismatched receipts remain unresolved until an owner records a resolution", async () => {
  const { adapter, service } = operations();
  const payment = await service.prepareBankTransfer(input());
  await service.recordBankReceipt({
    paymentDocumentId: payment.documentId,
    amountMinor: 9_000,
    currency: "RON",
    receivedAt: now,
    actor: "owner@example.test",
    providerEventId: "receipt:under",
  });

  assert.equal(
    await service.expireDuePayments(new Date("2026-08-01T00:00:00.000Z"), 100),
    0,
  );
  assert.equal(adapter.payments.get(payment.documentId).status, "underpaid");
});

test("a receipt after the authoritative payment expiry can never settle", async () => {
  let settlements = 0;
  const { adapter, service } = operations({
    settleSubject: async () => { settlements += 1; },
  });
  const payment = await service.prepareBankTransfer(input());

  await assert.rejects(
    service.recordBankReceipt({
      paymentDocumentId: payment.documentId,
      amountMinor: 10_000,
      currency: "RON",
      receivedAt: new Date("2026-07-28T08:00:00.000Z"),
      actor: "owner@example.test",
      providerEventId: "receipt:late",
    }),
    /expired/i,
  );
  assert.equal(settlements, 0);
  assert.equal(adapter.payments.get(payment.documentId).status, "awaiting_payment");
});

test("downstream settlement failure rolls back payment and event state", async () => {
  const { adapter, service } = operations({
    settleSubject: async () => { throw new Error("membership activation failed"); },
  });
  const payment = await service.prepareBankTransfer(input());

  await assert.rejects(
    service.recordBankReceipt({
      paymentDocumentId: payment.documentId,
      amountMinor: 10_000,
      currency: "RON",
      receivedAt: now,
      actor: "owner@example.test",
      providerEventId: "receipt:rollback",
    }),
    /membership activation failed/,
  );

  assert.equal(adapter.payments.get(payment.documentId).status, "awaiting_payment");
  assert.equal(adapter.payments.get(payment.documentId).receivedAmountMinor, undefined);
  assert.equal(adapter.events.some((event) => event.providerEventId === "receipt:rollback"), false);
});

test("all direct transaction operations require the exact payment feature flag", async () => {
  for (const value of [undefined, "", "TRUE", "1", "false"]) {
    const adapter = createMemoryPaymentAdapter();
    const service = createPaymentTransactions(adapter, {
      env: { PAYMENTS_ENABLED: value },
      beneficiary,
    });
    await assert.rejects(service.prepareBankTransfer(input()), /not found/i);
    await assert.rejects(service.expireDuePayments(now, 1), /not found/i);
  }
});

test("beneficiary configuration is snapshotted from required server-only values", () => {
  assert.deepEqual(beneficiaryFromEnv({
    PAYMENT_BENEFICIARY_NAME: " Jamora SRL ",
    PAYMENT_BENEFICIARY_IBAN: " ro49 aaaa 1b31 0075 9384 0000 ",
    PAYMENT_BENEFICIARY_BANK: " Banca Jamora ",
  }), {
    name: "Jamora SRL",
    iban: "RO49AAAA1B31007593840000",
    bank: "Banca Jamora",
  });
  assert.throws(() => beneficiaryFromEnv({}), /beneficiary name is required/i);
  assert.throws(() => beneficiaryFromEnv({
    PAYMENT_BENEFICIARY_NAME: "Jamora",
    PAYMENT_BENEFICIARY_IBAN: "bad",
  }), /IBAN/i);
});

test("guest capability must be the authoritative live reservation for the order subject", () => {
  const reservation = {
    token: "reservation-1",
    status: "reserved",
    expiresAt: "2026-07-25T09:00:00.000Z",
  };
  assert.equal(validateGuestCheckoutCapability(
    reservation,
    { subjectType: "order", subjectId: "reservation-1", guestCheckoutCapability: "reservation-1" },
    now,
  ), "guest:reservation-1");
  assert.throws(
    () => validateGuestCheckoutCapability(null, {
      subjectType: "order", subjectId: "reservation-1", guestCheckoutCapability: "reservation-1",
    }, now),
    /capability is invalid/i,
  );
  assert.throws(
    () => validateGuestCheckoutCapability(reservation, {
      subjectType: "membership", subjectId: "another", guestCheckoutCapability: "reservation-1",
    }, now),
    /binding is invalid/i,
  );
  assert.throws(
    () => validateGuestCheckoutCapability(
      { ...reservation, expiresAt: "2026-07-25T07:59:59.000Z" },
      { subjectType: "order", subjectId: "reservation-1", guestCheckoutCapability: "reservation-1" },
      now,
    ),
    /expired/i,
  );
});

test("authoritative membership and order subjects replace caller money, target, owner, and snapshot", () => {
  const membership = deriveAuthoritativePaymentSubject({
    subjectType: "membership",
    subjectId: "membership-1",
    purpose: "membership_purchase",
    customerDocumentId: "customer-1",
    amountMinor: 1,
    currency: "RON",
    priceSnapshot: { forged: true },
  }, {
    documentId: "membership-1",
    customerDocumentId: "customer-1",
    status: "pending_payment",
    planSnapshot: {
      name: "Club",
      priceEurMinor: 2_000,
      priceRonMinor: 10_000,
    },
  }, null, now);
  assert.deepEqual(membership, {
    subjectType: "membership",
    subjectId: "membership-1",
    ownerDocumentId: "customer-1",
    customerDocumentId: "customer-1",
    purpose: "membership_purchase",
    membershipDocumentId: "membership-1",
    amountMinor: 10_000,
    currency: "RON",
    priceSnapshot: {
      membershipPlan: {
        name: "Club",
        priceEurMinor: 2_000,
        priceRonMinor: 10_000,
      },
      charge: { amountMinor: 10_000, currency: "RON" },
    },
  });

  const order = deriveAuthoritativePaymentSubject({
    subjectType: "order",
    subjectId: "order-1",
    purpose: "order",
    guestCheckoutCapability: "reservation-1",
    amountMinor: 1,
    currency: "RON",
    priceSnapshot: { forged: true },
  }, {
    documentId: "order-1",
    customerDocumentId: null,
    reservationToken: "reservation-1",
    status: "pending",
    totalCents: 2_000,
    currency: "eur",
    priceSnapshot: {
      reference: { amountMinor: 2_000, currency: "EUR" },
      charge: { amountMinor: 10_000, currency: "RON" },
    },
  }, {
    token: "reservation-1",
    status: "reserved",
    expiresAt: "2026-07-25T08:10:00.000Z",
  }, now);
  assert.equal(order.amountMinor, 10_000);
  assert.equal(order.orderDocumentId, "order-1");
  assert.equal(order.ownerDocumentId, "guest:reservation-1");
  assert.equal(order.subjectExpiresAt, "2026-07-25T08:10:00.000Z");
  assert.equal(order.priceSnapshot.forged, undefined);
});

test("generic settlement allowlists provider fields and rejects receipt money mismatch", async () => {
  const { adapter, service } = operations();
  const payment = await service.prepareBankTransfer(input());

  await assert.rejects(
    service.settlePayment({
      paymentDocumentId: payment.documentId,
      actor: "provider",
      providerEventId: "provider:bad-money",
      receivedAmountMinor: 1,
      receivedCurrency: "RON",
      paymentPatch: { amountMinor: 1, subjectId: "forged" },
    }),
    /settlement money mismatch/i,
  );
  const paid = await service.settlePayment({
    paymentDocumentId: payment.documentId,
    actor: "provider",
    providerEventId: "provider:paid",
    receivedAmountMinor: 10_000,
    receivedCurrency: "RON",
    providerReference: "provider-reference-1",
    paymentPatch: { amountMinor: 1, subjectId: "forged" },
  });
  assert.equal(paid.amountMinor, 10_000);
  assert.equal(paid.subjectId, "reservation-1");
  assert.equal(paid.providerReference, "provider-reference-1");
  assert.equal(adapter.payments.get(payment.documentId).amountMinor, 10_000);
  await assert.rejects(
    service.settlePayment({
      paymentDocumentId: payment.documentId,
      actor: "provider",
      providerEventId: "provider:paid",
      receivedAmountMinor: 9_999,
      receivedCurrency: "RON",
      providerReference: "provider-reference-1",
    }),
    /settlement money mismatch/i,
  );
});

test("generic settlement cannot settle an expired payment", async () => {
  const { adapter, service } = operations();
  const payment = await service.prepareBankTransfer(input());
  await assert.rejects(
    service.settlePayment({
      paymentDocumentId: payment.documentId,
      actor: "provider",
      providerEventId: "provider:late",
      occurredAt: "2026-07-28T08:00:00.000Z",
    }),
    /expired/i,
  );
  assert.equal(adapter.payments.get(payment.documentId).status, "awaiting_payment");
});

test("Strapi adapter enlists row lock and authoritative payment/event reads in one transaction", async () => {
  const calls = [];
  const trx = { marker: "same-transaction" };
  const queries = {
    "api::payment.payment": {
      async findOne(options) {
        calls.push(["payment.findOne", options]);
        return { documentId: "payment-1", status: "awaiting_payment" };
      },
      async findMany() { return []; },
    },
    "api::payment-event.payment-event": {
      async findMany(options) {
        calls.push(["event.findMany", options]);
        return [];
      },
    },
  };
  const strapi = {
    db: {
      query: (uid) => queries[uid],
      async transaction(work) {
        calls.push(["transaction"]);
        return work({ trx });
      },
      connection(table) {
        calls.push(["connection", table]);
        const builder = {
          where(value) { calls.push(["where", value]); return builder; },
          transacting(value) { calls.push(["transacting", value]); return builder; },
          forUpdate() { calls.push(["forUpdate"]); return builder; },
          async first() { calls.push(["first"]); return {}; },
        };
        return builder;
      },
    },
  };
  let validationContext;
  const adapter = createStrapiPaymentAdapter(strapi, {
    async validateSettlementSubject(_payment, context) {
      validationContext = context;
    },
  });

  await adapter.transaction(async (tx) => {
    await tx.lockPayment("payment-1");
    await tx.listEvents("payment-1");
    await tx.validateSettlementSubject(
      { documentId: "payment-1" },
      { occurredAt: "2026-07-25T08:00:00.000Z" },
    );
  });

  assert.equal(calls.filter(([name]) => name === "transaction").length, 1);
  assert.equal(calls.filter(([name]) => name === "forUpdate").length, 1);
  assert.equal(calls.find(([name]) => name === "transacting")[1], trx);
  assert.equal(calls.find(([name]) => name === "payment.findOne")[1].transacting, trx);
  assert.equal(calls.find(([name]) => name === "event.findMany")[1].transacting, trx);
  assert.ok(
    calls.findIndex(([name]) => name === "forUpdate") <
      calls.findIndex(([name]) => name === "payment.findOne"),
  );
  assert.equal(validationContext.trx, trx);
  assert.equal(validationContext.occurredAt, "2026-07-25T08:00:00.000Z");
});

test("ordinary order settlement binds guests by capability and target separately", () => {
  const order = {
    documentId: "order-1",
    reservationToken: "reservation-1",
    status: "pending",
  };
  assert.doesNotThrow(() => assertOrderPaymentBinding(order, {
    subjectId: "order-1",
    orderDocumentId: "order-1",
    ownerDocumentId: "guest:reservation-1",
  }));
  assert.throws(() => assertOrderPaymentBinding(order, {
    subjectId: "order-1",
    orderDocumentId: "order-1",
    ownerDocumentId: "guest:another-reservation",
  }), /guest payment order binding/i);
});

test("membership checkout settlement prepays its bound pending order before Phase 1 finalization", async () => {
  const calls = [];
  const settle = createPaymentSubjectSettlement({
    async activateMembership() { assert.fail("not an activation"); },
    async settleOrder(payment) {
      calls.push(["settleOrder", payment.orderDocumentId]);
      return { order: { documentId: payment.orderDocumentId, status: "paid" } };
    },
    async finalizeMembershipCheckout(input) {
      calls.push(["finalize", input.orderDocumentId, input.idempotencyKey]);
      return { order: { documentId: input.orderDocumentId, status: "paid" } };
    },
  });

  await settle({
    documentId: "payment-1",
    purpose: "order",
    subjectId: "checkout-1",
    customerDocumentId: "customer-1",
    membershipDocumentId: "membership-1",
    orderDocumentId: "order-1",
    paidAt: "2026-07-25T10:00:00.000Z",
    priceSnapshot: { membershipCheckout: { checkoutReference: "checkout-1" } },
  }, { settlementKey: "payment:payment-1:settle" });

  assert.deepEqual(calls, [
    ["settleOrder", "order-1"],
    ["finalize", "order-1", "payment:payment-1:settle"],
  ]);
});
