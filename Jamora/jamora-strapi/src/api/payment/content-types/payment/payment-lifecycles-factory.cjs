"use strict";

const {
  validatePaymentMoney,
  validatePaymentMoneyBulkPatch,
} = require("./payment-money-validation.cjs");

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
      validatePaymentMoney(event.params.data);
    },
    beforeCreateMany(event) {
      for (const payment of event.params.data ?? []) validatePaymentMoney(payment);
    },
    async beforeUpdate(event) {
      validatePaymentMoney(event.params.data, await findExistingPayment(event));
    },
    beforeUpdateMany(event) {
      validatePaymentMoneyBulkPatch(event.params.data);
    },
  };
}

module.exports = { createPaymentLifecycles };
