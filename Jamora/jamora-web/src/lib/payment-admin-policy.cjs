"use strict";

function isPaymentsEnabled(env = process.env) {
  return env.PAYMENTS_ENABLED === "true";
}

function canManagePayments(identity) {
  return identity?.role === "owner";
}

function paymentAdminPath(segments) {
  const path = Array.isArray(segments) ? segments : [];
  if (path.length === 1 && path[0] === "list") return "/api/jamora/admin/payments";
  if (path.length === 1 && path[0] === "expire") return "/api/jamora/admin/payments/expire";
  if (path.length === 2 && safeSegment(path[0]) && (path[1] === "receipt" || path[1] === "resolve")) {
    return `/api/jamora/admin/payments/${encodeURIComponent(path[0])}/${path[1]}`;
  }
  throw new Error("Payment admin path is not allowed.");
}

function assertPaymentAdminMethod(method, path) {
  const allowed =
    (method === "GET" && path.length === 1 && path[0] === "list") ||
    (method === "POST" && path.length === 1 && path[0] === "expire") ||
    (method === "POST" && path.length === 2 && safeSegment(path[0]) &&
      (path[1] === "receipt" || path[1] === "resolve"));
  if (!allowed) throw new Error("Payment admin method is not allowed.");
}

function paymentProviderError() {
  return "Payment service unavailable.";
}

function assertPaymentReceiptInput(input) {
  const amountMinor = Number(input?.amountMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("Receipt amount must be a non-negative safe integer.");
  }
  const currency = text(input?.currency).toUpperCase();
  if (currency !== "RON" && currency !== "EUR") throw new Error("Receipt currency must be RON or EUR.");
  const bankReference = text(input?.bankReference);
  if (!bankReference) throw new Error("Bank reference is required.");
  return { amountMinor, currency, bankReference };
}

function assertPaymentResolutionInput(input) {
  const reason = text(input?.reason);
  if (!reason) throw new Error("Resolution reason is required.");
  const resolution = input?.resolution === undefined ? "accept" : text(input.resolution);
  if (resolution !== "accept" && resolution !== "cancel") {
    throw new Error("Resolution must be accept or cancel.");
  }
  return { reason, resolution };
}

function safeSegment(value) {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." && !value.includes("/");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  assertPaymentAdminMethod,
  assertPaymentReceiptInput,
  assertPaymentResolutionInput,
  canManagePayments,
  isPaymentsEnabled,
  paymentAdminPath,
  paymentProviderError,
};
