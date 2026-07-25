"use strict";

function pendingPaymentOrderFields({ customerDocumentId, priceSnapshot }) {
  return {
    status: "pending",
    ...(customerDocumentId ? { customerDocumentId } : {}),
    priceSnapshot: structuredClone(priceSnapshot),
    statusHistory: [{
      type: "status",
      status: "pending",
      note: "Awaiting payment confirmation.",
      actor: "Checkout",
    }],
  };
}

function phase1MockPaidOrderFields(orderNumber) {
  return {
    status: "paid",
    stripeSessionId: "mock-paid-checkout",
    invoiceNumber: orderNumber.replace(/^JMR-/, "INV-"),
    statusHistory: [{
      type: "status",
      status: "paid",
      note: "Payment confirmed in test mode.",
      actor: "Checkout",
    }],
  };
}

module.exports = {
  pendingPaymentOrderFields,
  phase1MockPaidOrderFields,
};
