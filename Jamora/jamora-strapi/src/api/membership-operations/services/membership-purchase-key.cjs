"use strict";

const { createHash } = require("node:crypto");

function purchasePaymentReference(customerDocumentId, operation, idempotencyKey, renewalOf = "") {
  if (typeof customerDocumentId !== "string" || !customerDocumentId.trim()) {
    throw new Error("Customer identity is required.");
  }
  if (!["purchase", "renew"].includes(operation)) {
    throw new Error("A valid membership operation is required.");
  }
  if (operation === "renew" && (typeof renewalOf !== "string" || !renewalOf.trim())) {
    throw new Error("A renewal target is required.");
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 200) {
    throw new Error("A valid purchase idempotency key is required.");
  }
  const digest = createHash("sha256")
    .update(`${customerDocumentId.trim()}\0${operation}\0${renewalOf.trim()}\0${idempotencyKey.trim()}`)
    .digest("hex");
  return `phase1-mock:${digest}`;
}

module.exports = { purchasePaymentReference };
