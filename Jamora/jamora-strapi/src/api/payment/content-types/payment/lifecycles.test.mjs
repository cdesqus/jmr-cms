import assert from "node:assert/strict";
import test from "node:test";

import lifecycleModule from "./payment-lifecycles-factory.cjs";

const { createPaymentLifecycles } = lifecycleModule;

const expectedMoney = { amountMinor: 10000, currency: "RON" };
const lifecycleFor = (existing = expectedMoney) => createPaymentLifecycles(async () => existing);

test("validates expected and received money when a payment is created", () => {
  const lifecycles = lifecycleFor();
  assert.doesNotThrow(() => lifecycles.beforeCreate({ params: { data: { ...expectedMoney } } }));
  assert.doesNotThrow(() => lifecycles.beforeCreate({ params: { data: {
    ...expectedMoney, receivedAmountMinor: 10000, receivedCurrency: "EUR",
  } } }));
  assert.throws(() => lifecycles.beforeCreate({ params: { data: {
    amountMinor: -1, currency: "RON",
  } } }), /amountMinor/);
  assert.throws(() => lifecycles.beforeCreate({ params: { data: {
    ...expectedMoney, receivedAmountMinor: 10000,
  } } }), /received/);
  assert.throws(() => lifecycles.beforeCreate({ params: { data: {
    ...expectedMoney, receivedAmountMinor: Number.MAX_SAFE_INTEGER + 1, receivedCurrency: "RON",
  } } }), /amountMinor/);
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
