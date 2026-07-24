"use strict";

const { normaliseMoney } = require("../../../payment-operations/services/payment-domain.cjs");

const has = (data, key) => Object.prototype.hasOwnProperty.call(data, key);

function validatePair(data, existing, amountKey, currencyKey, label, required) {
  const amountProvided = has(data, amountKey);
  const currencyProvided = has(data, currencyKey);
  const amountMinor = amountProvided ? data[amountKey] : existing?.[amountKey];
  const currency = currencyProvided ? data[currencyKey] : existing?.[currencyKey];
  const exists = amountMinor !== undefined || currency !== undefined;

  if (!exists) {
    if (required) throw new TypeError(`${label} money is required.`);
    return;
  }
  if (amountMinor === undefined || amountMinor === null || currency === undefined || currency === null) {
    throw new TypeError(`${label} money requires amountMinor and currency together.`);
  }

  const normalised = normaliseMoney({ amountMinor, currency });
  if (amountProvided) data[amountKey] = normalised.amountMinor;
  if (currencyProvided) data[currencyKey] = normalised.currency;
}

function validatePaymentMoney(data, existing) {
  if (!data || typeof data !== "object") throw new TypeError("Payment data is required.");
  validatePair(data, existing, "amountMinor", "currency", "expected", true);
  validatePair(data, existing, "receivedAmountMinor", "receivedCurrency", "received", false);
}

function validatePaymentMoneyBulkPatch(data) {
  if (!data || typeof data !== "object") throw new TypeError("Payment data is required.");
  const expectedTouched = has(data, "amountMinor") || has(data, "currency");
  const receivedTouched = has(data, "receivedAmountMinor") || has(data, "receivedCurrency");
  if (expectedTouched) validatePair(data, undefined, "amountMinor", "currency", "expected", true);
  if (receivedTouched) validatePair(data, undefined, "receivedAmountMinor", "receivedCurrency", "received", true);
}

module.exports = { validatePaymentMoney, validatePaymentMoneyBulkPatch };
