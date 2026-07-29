"use strict";

function authorizePaymentStatus(payment, identity) {
  if (!payment) throw new Error("Payment not found.");
  if (
    identity?.customerDocumentId &&
    payment.customerDocumentId === identity.customerDocumentId &&
    payment.ownerDocumentId === identity.customerDocumentId
  ) {
    return payment;
  }
  if (
    identity?.guestCheckoutCapability &&
    payment.ownerDocumentId === `guest:${identity.guestCheckoutCapability}`
  ) {
    return payment;
  }
  throw new Error("Payment not found.");
}

module.exports = { authorizePaymentStatus };
