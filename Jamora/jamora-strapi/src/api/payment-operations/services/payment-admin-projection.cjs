"use strict";

function projectAdminPayments(payments, events) {
  const allowedPayments = new Set(payments.map((payment) => payment.documentId));
  const eventsByPayment = new Map();
  for (const event of events) {
    if (!allowedPayments.has(event.paymentDocumentId)) continue;
    const history = eventsByPayment.get(event.paymentDocumentId) ?? [];
    history.push({
      eventId: event.eventId,
      transition: event.transition,
      actor: event.actor,
      ...(event.reason ? { reason: event.reason } : {}),
      occurredAt: event.occurredAt,
    });
    eventsByPayment.set(event.paymentDocumentId, history);
  }

  return payments.map((payment) => ({
    documentId: payment.documentId,
    paymentReference: payment.paymentReference,
    purpose: payment.purpose,
    method: payment.method,
    expected: { amountMinor: payment.amountMinor, currency: payment.currency },
    ...(Number.isSafeInteger(payment.receivedAmountMinor) && payment.receivedCurrency
      ? {
          received: {
            amountMinor: payment.receivedAmountMinor,
            currency: payment.receivedCurrency,
            ...(payment.receivedAt ? { receivedAt: payment.receivedAt } : {}),
          },
        }
      : {}),
    status: payment.status,
    ...(payment.expiresAt ? { expiresAt: payment.expiresAt } : {}),
    ...(payment.customerDocumentId ? { customerDocumentId: payment.customerDocumentId } : {}),
    ...(payment.orderDocumentId ? { orderDocumentId: payment.orderDocumentId } : {}),
    ...(payment.membershipDocumentId ? { membershipDocumentId: payment.membershipDocumentId } : {}),
    events: eventsByPayment.get(payment.documentId) ?? [],
  }));
}

module.exports = { projectAdminPayments };
