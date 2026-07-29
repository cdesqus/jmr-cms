"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const access = new AsyncLocalStorage();

function withPaymentWriteAccess(work) {
  return access.run(true, work);
}

function assertPaymentWriteAccess() {
  if (access.getStore() !== true) {
    throw new Error("Payment writes are only allowed through the payment operations service.");
  }
}

module.exports = { assertPaymentWriteAccess, withPaymentWriteAccess };
