import assert from "node:assert/strict";
import test from "node:test";

import lifecycleModule from "./payment-lifecycles-factory.cjs";
import writeGuardModule from "./payment-write-guard.cjs";

const { createPaymentLifecycles } = lifecycleModule;
const { withPaymentWriteAccess } = writeGuardModule;

const expectedMoney = { amountMinor: 10000, currency: "RON" };
const rawLifecycleFor = (existing = expectedMoney) =>
  createPaymentLifecycles(async () => existing);
const lifecycleFor = (existing = expectedMoney) => {
  const raw = rawLifecycleFor(existing);
  return Object.fromEntries(Object.entries(raw).map(([name, handler]) => [
    name,
    (...args) => withPaymentWriteAccess(() => handler(...args)),
  ]));
};

test("validates expected and received money when an authorized payment is created", async () => {
  const lifecycles = rawLifecycleFor();
  assert.throws(
    () => lifecycles.beforeCreate({ params: { data: { ...expectedMoney } } }),
    /payment operations service/i,
  );
  assert.doesNotThrow(() => withPaymentWriteAccess(
    () => lifecycles.beforeCreate({ params: { data: { ...expectedMoney } } }),
  ));
  assert.doesNotThrow(() => withPaymentWriteAccess(() => lifecycles.beforeCreate({ params: { data: {
    ...expectedMoney, receivedAmountMinor: 10000, receivedCurrency: "EUR",
  } } })));
  assert.throws(() => withPaymentWriteAccess(() => lifecycles.beforeCreate({ params: { data: {
    amountMinor: -1, currency: "RON",
  } } })), /amountMinor/);
  assert.throws(() => withPaymentWriteAccess(() => lifecycles.beforeCreate({ params: { data: {
    ...expectedMoney, receivedAmountMinor: 10000,
  } } })), /received/);
  assert.throws(() => withPaymentWriteAccess(() => lifecycles.beforeCreate({ params: { data: {
    ...expectedMoney, receivedAmountMinor: Number.MAX_SAFE_INTEGER + 1, receivedCurrency: "RON",
  } } })), /amountMinor/);
});

test("validates every createMany payment row", () => {
  const lifecycles = lifecycleFor();
  assert.throws(() => lifecycles.beforeCreateMany({ params: { data: [
    { ...expectedMoney },
    { amountMinor: 10000, currency: "USD" },
  ] } }), /currency/);
});

test("merges partial payment updates with persisted money without allowing incomplete receipt pairs", async () => {
  const lifecycles = lifecycleFor({ ...expectedMoney, receivedAmountMinor: 9000, receivedCurrency: "RON" });
  await assert.doesNotReject(() => lifecycles.beforeUpdate({ params: { data: { status: "underpaid" }, where: { id: 1 } } }));
  await assert.doesNotReject(() => lifecycles.beforeUpdate({ params: { data: { receivedAmountMinor: 9500 }, where: { id: 1 } } }));
  await assert.rejects(
    () => lifecycleFor(expectedMoney).beforeUpdate({ params: { data: { receivedAmountMinor: 9500 }, where: { id: 1 } } }),
    /received/,
  );
  await assert.rejects(
    () => lifecycleFor({ amountMinor: 10000, currency: "USD" }).beforeUpdate({ params: { data: { amountMinor: 12000 }, where: { id: 1 } } }),
    /immutable/,
  );
});

test("rejects partial money updates in bulk so they cannot bypass validation", () => {
  const lifecycles = lifecycleFor();
  assert.throws(
    () => lifecycles.beforeUpdateMany({ params: { data: { amountMinor: 12000, currency: "RON" } } }),
    /immutable/i,
  );
  assert.throws(() => lifecycles.beforeUpdateMany({ params: { data: { receivedCurrency: "EUR" } } }), /received/);
});

test("payment identity, target, expected money, expiry, and snapshots are immutable after create", async () => {
  const existing = {
    paymentNumber: "PAY-1",
    idempotencyKey: "prepare-1",
    subjectType: "order",
    subjectId: "order-1",
    ownerDocumentId: "customer-1",
    amountMinor: 10000,
    currency: "RON",
    priceSnapshot: { bankTransfer: { iban: "RO49AAAA1B31007593840000" } },
    expiresAt: "2026-07-26T00:00:00.000Z",
  };
  const lifecycles = lifecycleFor(existing);
  for (const [field, value] of [
    ["subjectId", "order-2"],
    ["amountMinor", 1],
    ["currency", "EUR"],
    ["priceSnapshot", { forged: true }],
    ["expiresAt", "2030-01-01T00:00:00.000Z"],
  ]) {
    await assert.rejects(
      () => lifecycles.beforeUpdate({ params: { data: { [field]: value }, where: { id: 1 } } }),
      /immutable/i,
    );
    assert.throws(
      () => lifecycles.beforeUpdateMany({ params: { data: { [field]: value } } }),
      /immutable/i,
    );
  }
});

test("a persisted provider reference cannot be replaced after intent creation", async () => {
  const lifecycles = lifecycleFor({
    ...expectedMoney,
    providerReference: "RPI-ORIGINAL",
  });
  await assert.rejects(
    () => lifecycles.beforeUpdate({
      params: {
        data: { providerReference: "RPI-FORGED" },
        where: { id: 1 },
      },
    }),
    /providerReference.*immutable/i,
  );
  await assert.doesNotReject(
    () => lifecycleFor(expectedMoney).beforeUpdate({
      params: {
        data: { providerReference: "RPI-FIRST" },
        where: { id: 1 },
      },
    }),
  );
});

test("direct update and delete lifecycle mutations are denied outside payment operations", async () => {
  const lifecycles = rawLifecycleFor();
  await assert.rejects(
    () => lifecycles.beforeUpdate({ params: { data: { status: "paid" }, where: { id: 1 } } }),
    /payment operations service/i,
  );
  assert.throws(
    () => lifecycles.beforeDelete({ params: { where: { id: 1 } } }),
    /payment operations service/i,
  );
});
