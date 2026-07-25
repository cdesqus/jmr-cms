"use strict";

const {
  validatePaymentMoney,
  validatePaymentMoneyBulkPatch,
} = require("./payment-money-validation.cjs");
const { assertPaymentWriteAccess } = require("./payment-write-guard.cjs");

const IMMUTABLE_FIELDS = new Set([
  "paymentNumber",
  "idempotencyKey",
  "subjectType",
  "subjectId",
  "method",
  "provider",
  "amountMinor",
  "currency",
  "priceSnapshot",
  "customerDocumentId",
  "ownerDocumentId",
  "purpose",
  "orderDocumentId",
  "membershipDocumentId",
  "paymentReference",
  "expiresAt",
]);

function same(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function rejectImmutablePatch(data, existing) {
  for (const field of IMMUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field) &&
        (!existing || !same(data[field], existing[field]))) {
      throw new Error(`Payment ${field} is immutable.`);
    }
  }
}

async function findPayment(event) {
  const where = event?.params?.where;
  if (!where || Object.keys(where).length === 0) throw new Error("Payment update requires a target.");
  const payment = await globalThis.strapi.db.query("api::payment.payment").findOne({ where });
  if (!payment) throw new Error("Payment update target was not found.");
  return payment;
}

function createPaymentLifecycles(findExistingPayment = findPayment) {
  return {
    beforeCreate(event) {
      assertPaymentWriteAccess();
      validatePaymentMoney(event.params.data);
    },
    beforeCreateMany(event) {
      assertPaymentWriteAccess();
      for (const payment of event.params.data ?? []) validatePaymentMoney(payment);
    },
    async beforeUpdate(event) {
      assertPaymentWriteAccess();
      const existing = await findExistingPayment(event);
      rejectImmutablePatch(event.params.data, existing);
      validatePaymentMoney(event.params.data, existing);
    },
    beforeUpdateMany(event) {
      assertPaymentWriteAccess();
      rejectImmutablePatch(event.params.data);
      validatePaymentMoneyBulkPatch(event.params.data);
    },
    beforeDelete() {
      assertPaymentWriteAccess();
    },
    beforeDeleteMany() {
      assertPaymentWriteAccess();
    },
  };
}

module.exports = { createPaymentLifecycles };
