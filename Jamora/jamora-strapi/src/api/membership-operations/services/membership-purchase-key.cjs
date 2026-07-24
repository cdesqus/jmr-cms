"use strict";

const { createHash } = require("node:crypto");

function purchasePaymentReference(customerDocumentId, idempotencyKey) {
  if (typeof customerDocumentId !== "string" || !customerDocumentId.trim()) {
    throw new Error("Customer identity is required.");
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 200) {
    throw new Error("A valid purchase idempotency key is required.");
  }
  const digest = createHash("sha256")
    .update(`${customerDocumentId.trim()}\0${idempotencyKey.trim()}`)
    .digest("hex");
  return `phase1-mock:${digest}`;
}

module.exports = { purchasePaymentReference };
