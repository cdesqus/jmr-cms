"use strict";

const CURRENCIES = new Set(["RON", "EUR"]);

const TRANSITIONS = Object.freeze({
  created: new Set([
    "awaiting_payment", "pending_provider", "paid", "underpaid", "overpaid", "currency_mismatch", "expired", "cancelled", "failed",
  ]),
  processing: new Set([
    "awaiting_payment", "pending_provider", "paid", "underpaid", "overpaid", "currency_mismatch", "expired", "cancelled", "failed",
  ]),
  awaiting_payment: new Set([
    "pending_provider", "paid", "underpaid", "overpaid", "currency_mismatch", "expired", "cancelled", "failed",
  ]),
  pending_provider: new Set([
    "awaiting_payment", "paid", "underpaid", "overpaid", "currency_mismatch", "expired", "cancelled", "failed",
  ]),
  underpaid: new Set(["awaiting_payment", "pending_provider", "paid", "expired", "cancelled", "failed"]),
  overpaid: new Set(["awaiting_payment", "pending_provider", "paid", "expired", "cancelled", "failed"]),
  currency_mismatch: new Set(["awaiting_payment", "pending_provider", "paid", "expired", "cancelled", "failed"]),
  paid: new Set(["refunded"]),
  expired: new Set(),
  cancelled: new Set(),
  failed: new Set(),
  refunded: new Set(),
});

function normaliseMoney(input) {
  if (!input || typeof input !== "object") throw new Error("Money is required.");
  const { amountMinor } = input;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("amountMinor must be a non-negative safe integer.");
  }
  if (typeof input.currency !== "string") throw new Error("currency is required.");
  const currency = input.currency.trim().toUpperCase();
  if (!CURRENCIES.has(currency)) throw new Error("currency must be RON or EUR.");
  return { amountMinor, currency };
}

function classifyReceipt(expected, received) {
  const expectedMoney = normaliseMoney(expected);
  const receivedMoney = normaliseMoney(received);
  if (expectedMoney.currency !== receivedMoney.currency) {
    return { status: "currency_mismatch", differenceMinor: 0 };
  }
  const differenceMinor = receivedMoney.amountMinor - expectedMoney.amountMinor;
  if (differenceMinor === 0) return { status: "paid", differenceMinor };
  return {
    status: differenceMinor < 0 ? "underpaid" : "overpaid",
    differenceMinor,
  };
}

function canTransition(from, to) {
  return TRANSITIONS[from]?.has(to) ?? false;
}

function referencePart(value, name) {
  if (typeof value !== "string") throw new Error(`${name} is required.`);
  const normalised = value.trim().toUpperCase();
  if (!normalised || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalised)) {
    throw new Error(`${name} must contain uppercase letters, digits, and internal hyphens only.`);
  }
  return normalised;
}

function paymentReference(prefix, entropy) {
  return `${referencePart(prefix, "prefix")}-${referencePart(entropy, "entropy")}`;
}

module.exports = { canTransition, classifyReceipt, normaliseMoney, paymentReference };
