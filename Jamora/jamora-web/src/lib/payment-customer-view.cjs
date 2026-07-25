"use strict";

const TERMINAL = new Set([
  "paid",
  "expired",
  "cancelled",
  "failed",
  "refunded",
]);

function acceptedPaymentMethods(input) {
  const methods = Array.isArray(input?.methods) ? input.methods : [];
  return methods.includes("ropay")
    ? ["bank_transfer", "ropay"]
    : ["bank_transfer"];
}

function checkoutAttempt(current, signature, createKey) {
  if (current?.signature === signature) return current;
  return { signature, key: createKey() };
}

function paymentStatusView(status) {
  if (status === "paid") {
    return { tone: "paid", label: "Payment confirmed", paid: true };
  }
  if (["expired", "cancelled", "failed", "refunded"].includes(status)) {
    return {
      tone: "failed",
      label: status === "expired"
        ? "Payment expired"
        : `Payment ${status}`,
      paid: false,
    };
  }
  if (["underpaid", "overpaid", "currency_mismatch"].includes(status)) {
    return {
      tone: "attention",
      label: "Payment needs review",
      paid: false,
    };
  }
  return { tone: "pending", label: "Payment pending", paid: false };
}

function shouldPollPayment(status) {
  return !TERMINAL.has(status);
}

function mergePaymentSnapshot(current, next, now = new Date()) {
  const expiresAt = new Date(next?.expiresAt).getTime();
  const actionable = shouldPollPayment(next?.status)
    && Number.isFinite(expiresAt)
    && expiresAt > now.getTime();
  const samePendingPayment = current?.paymentReference === next?.paymentReference
    && actionable;
  const merged = {
    ...(samePendingPayment ? current : {}),
    ...next,
    ...(samePendingPayment && !next?.qrUrl && current?.qrUrl
      ? { qrUrl: current.qrUrl }
      : {}),
    ...(samePendingPayment && !next?.deepLink && current?.deepLink
      ? { deepLink: current.deepLink }
      : {}),
  };
  if (!actionable) {
    delete merged.qrUrl;
    delete merged.deepLink;
  }
  return merged;
}

function snapshotInstructionRows(snapshot) {
  if (snapshot?.method !== "bank_transfer") return [];
  return [
    ["Beneficiary", snapshot.beneficiary.name],
    ...(snapshot.beneficiary.bank
      ? [["Bank", snapshot.beneficiary.bank]]
      : []),
    ["IBAN", snapshot.beneficiary.iban],
    ["Reference", snapshot.paymentReference],
    [
      "Amount",
      { amountMinor: snapshot.amountMinor, currency: snapshot.currency },
    ],
    ["Expires", snapshot.expiresAt],
  ];
}

function paymentPreparationRequest(method, input) {
  if (
    !(
      (input?.subjectType === "order" && input.purpose === "order") ||
      (
        input?.subjectType === "membership" &&
        ["membership_purchase", "membership_renewal"].includes(input.purpose)
      )
    )
  ) {
    throw new Error("Payment subject and purpose do not match.");
  }
  if (!["bank_transfer", "ropay"].includes(method)) {
    throw new Error("Payment method is invalid.");
  }
  return {
    endpoint: method === "ropay"
      ? "/api/jamora/payments/ropay/intent"
      : "/api/jamora/payments/bank-transfer",
    body: { ...input },
  };
}

function pendingCheckoutOrderState(orderId, createdAt = new Date().toISOString()) {
  return {
    status: "pending",
    emailConfirmationSent: false,
    statusHistory: [{
      id: `evt-${orderId}-pending-payment`,
      type: "status",
      status: "pending",
      note: "Awaiting payment confirmation.",
      actor: "Checkout",
      createdAt,
    }],
  };
}

module.exports = {
  acceptedPaymentMethods,
  checkoutAttempt,
  mergePaymentSnapshot,
  paymentStatusView,
  paymentPreparationRequest,
  pendingCheckoutOrderState,
  shouldPollPayment,
  snapshotInstructionRows,
};
