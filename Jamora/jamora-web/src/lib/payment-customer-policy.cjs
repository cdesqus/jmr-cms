"use strict";

const PAYMENT_STATUSES = new Set([
  "awaiting_payment",
  "pending_provider",
  "paid",
  "underpaid",
  "overpaid",
  "currency_mismatch",
  "expired",
  "cancelled",
  "failed",
  "refunded",
]);
const PAYMENT_REFERENCE = /^JMR-[A-Z0-9-]{3,120}$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPaymentsEnabled(env) {
  return env.PAYMENTS_ENABLED === "true";
}

function isRoPayEnabled(env) {
  return isPaymentsEnabled(env) && env.ROPAY_ENABLED === "true";
}

function availablePaymentMethods(env, currency) {
  if (!isPaymentsEnabled(env)) return [];
  return isRoPayEnabled(env) && text(currency).toUpperCase() === "RON"
    ? ["bank_transfer", "ropay"]
    : ["bank_transfer"];
}

function customerPaymentPath(method, path, ropayEnabled) {
  if (
    method === "GET" &&
    Array.isArray(path) &&
    path.length === 1 &&
    path[0] === "methods"
  ) {
    return "local:methods";
  }
  if (
    method === "POST" &&
    Array.isArray(path) &&
    path.length === 1 &&
    path[0] === "bank-transfer"
  ) {
    return "/api/jamora/payments/bank-transfer";
  }
  if (
    ropayEnabled &&
    method === "POST" &&
    Array.isArray(path) &&
    path.length === 2 &&
    path[0] === "ropay" &&
    path[1] === "intent"
  ) {
    return "/api/jamora/payments/ropay/intent";
  }
  if (
    method === "GET" &&
    Array.isArray(path) &&
    path.length === 2 &&
    path[0] === "status" &&
    PAYMENT_REFERENCE.test(path[1])
  ) {
    return `/api/jamora/payments/status/${path[1]}`;
  }
  throw new Error("Not found.");
}

function trustedPaymentHeaders(inputHeaders, secret, customer, guestCapability) {
  if (!text(secret)) throw new Error("Storefront service unavailable.");
  const headers = new Headers(inputHeaders);
  headers.set("content-type", "application/json");
  headers.set("x-jamora-storefront-secret", text(secret));
  headers.delete("x-jamora-customer-document-id");
  headers.delete("x-jamora-customer-session-version");
  headers.delete("x-jamora-checkout-capability");
  if (customer) {
    headers.set("x-jamora-customer-document-id", text(customer.documentId));
    headers.set(
      "x-jamora-customer-session-version",
      String(customer.sessionVersion),
    );
  } else {
    const capability = text(guestCapability);
    if (!capability || capability.length > 500) {
      throw new Error("Guest checkout capability is required.");
    }
    headers.set("x-jamora-checkout-capability", capability);
  }
  return headers;
}

function paymentPreparationBody(input, method) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid request.");
  }
  const idempotencyKey = text(input.idempotencyKey);
  const subjectType = text(input.subjectType);
  const subjectId = text(input.subjectId);
  const purpose = text(input.purpose);
  const currency = text(input.currency).toUpperCase();
  if (!idempotencyKey || idempotencyKey.length > 200 || !subjectId) {
    throw new Error("Invalid request.");
  }
  if (
    !(
      (subjectType === "order" && purpose === "order") ||
      (
        subjectType === "membership" &&
        ["membership_purchase", "membership_renewal"].includes(purpose)
      )
    )
  ) {
    throw new Error("Payment subject and purpose do not match.");
  }
  if (!["RON", "EUR"].includes(currency)) throw new Error("Invalid request.");
  if (method === "ropay" && currency !== "RON") {
    throw new Error("RoPay currency must be RON.");
  }
  const checkoutReference = text(input.checkoutReference);
  return {
    idempotencyKey,
    subjectType,
    subjectId,
    purpose,
    currency,
    ...(checkoutReference ? { checkoutReference } : {}),
  };
}

function safeRoPayPresentation(qrValue, deepLinkValue) {
  let qrUrl;
  let deepLink;
  let qrToken;
  let deepLinkToken;
  try {
    if (qrValue !== undefined) {
      if (typeof qrValue !== "string") throw new Error();
      const url = new URL(qrValue);
      const match = /^\/qr\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (
        url.protocol !== "https:"
        || url.hostname !== "mock.ropay.invalid"
        || url.port
        || url.username
        || url.password
        || url.search
        || url.hash
        || !match
      ) throw new Error();
      qrUrl = qrValue;
      qrToken = match[1];
    }
    if (deepLinkValue !== undefined) {
      if (typeof deepLinkValue !== "string") throw new Error();
      const url = new URL(deepLinkValue);
      const match = /^\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (
        url.protocol !== "ropay:"
        || url.hostname !== "pay"
        || url.port
        || url.username
        || url.password
        || url.search
        || url.hash
        || !match
      ) throw new Error();
      deepLink = deepLinkValue;
      deepLinkToken = match[1];
    }
    if (qrToken && deepLinkToken && qrToken !== deepLinkToken) throw new Error();
    return { qrUrl, deepLink };
  } catch {
    throw new Error("Invalid payment response.");
  }
}

function safePaymentResponse(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid payment response.");
  }
  const method = input.method;
  const status = input.status;
  const paymentReference = text(input.paymentReference);
  const amountMinor = input.amountMinor;
  const currency = text(input.currency).toUpperCase();
  const expiresAt = text(input.expiresAt);
  if (
    !["bank_transfer", "ropay"].includes(method) ||
    !PAYMENT_STATUSES.has(status) ||
    !PAYMENT_REFERENCE.test(paymentReference) ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    !["RON", "EUR"].includes(currency) ||
    !Number.isFinite(new Date(expiresAt).getTime())
  ) {
    throw new Error("Invalid payment response.");
  }
  const result = {
    method,
    status,
    paymentReference,
    amountMinor,
    currency,
    expiresAt: new Date(expiresAt).toISOString(),
  };
  if (method === "bank_transfer") {
    const name = text(input.beneficiary?.name);
    const iban = text(input.beneficiary?.iban);
    const bank = text(input.beneficiary?.bank);
    if (!name || !iban) throw new Error("Invalid payment response.");
    result.beneficiary = { name, iban, ...(bank ? { bank } : {}) };
  } else {
    const presentation = safeRoPayPresentation(
      Object.hasOwn(input, "qrUrl") ? input.qrUrl : undefined,
      Object.hasOwn(input, "deepLink") ? input.deepLink : undefined,
    );
    if (presentation.qrUrl) result.qrUrl = presentation.qrUrl;
    if (presentation.deepLink) result.deepLink = presentation.deepLink;
  }
  return result;
}

function safePendingOrderResponse(input) {
  const order = input?.order;
  const documentId = text(order?.documentId);
  const orderNumber = text(order?.orderNumber);
  if (!documentId || !orderNumber || order?.status !== "pending") {
    throw new Error("Invalid order response.");
  }
  return {
    order: {
      documentId,
      orderNumber,
      status: "pending",
    },
  };
}

function phase1PaidCheckoutAllowed(env) {
  return env.PAYMENTS_ENABLED !== "true";
}

module.exports = {
  availablePaymentMethods,
  customerPaymentPath,
  isPaymentsEnabled,
  isRoPayEnabled,
  paymentPreparationBody,
  phase1PaidCheckoutAllowed,
  safePaymentResponse,
  safePendingOrderResponse,
  trustedPaymentHeaders,
};
