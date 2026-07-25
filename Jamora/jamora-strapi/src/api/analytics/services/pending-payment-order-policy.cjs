"use strict";

const {
  hasStorefrontSecret,
} = require("../../customer-auth/controllers/storefront-secret.cjs");

function pendingPaymentOrderBoundary(env, providedSecret) {
  if (env.PAYMENTS_ENABLED !== "true") {
    return { status: 404, error: "Not found." };
  }
  if (!hasStorefrontSecret(
    providedSecret,
    env.JAMORA_STOREFRONT_API_SECRET,
  )) {
    return { status: 401, error: "Storefront API secret required." };
  }
  return null;
}

function pendingCustomerSessionInput(documentIdValue, sessionVersionValue) {
  const documentId =
    typeof documentIdValue === "string" ? documentIdValue.trim() : "";
  const versionText =
    typeof sessionVersionValue === "string" ? sessionVersionValue.trim() : "";
  if (!documentId && !versionText) return null;
  const sessionVersion = Number(versionText);
  if (
    !documentId ||
    !versionText ||
    !Number.isSafeInteger(sessionVersion) ||
    sessionVersion < 0
  ) {
    throw new Error("Invalid session.");
  }
  return { documentId, sessionVersion };
}

function phase1MockOrderAllowed(env, pendingPayment) {
  return pendingPayment === true || env.PAYMENTS_ENABLED !== "true";
}

function pendingPaymentReservationToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token || token.length > 500) {
    throw new Error("Stock reservation is required.");
  }
  return token;
}

module.exports = {
  pendingCustomerSessionInput,
  pendingPaymentOrderBoundary,
  pendingPaymentReservationToken,
  phase1MockOrderAllowed,
};
