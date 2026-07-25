"use strict";

function itemQuantities(items, label) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`Payment order ${label} is invalid.`);
  }
  const quantities = new Map();
  for (const item of items) {
    const slug = typeof item?.slug === "string" ? item.slug.trim() : "";
    const quantity = Number(item?.qty);
    if (!slug || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error(`Payment order ${label} is invalid.`);
    }
    const total = (quantities.get(slug) ?? 0) + quantity;
    if (!Number.isSafeInteger(total)) {
      throw new Error(`Payment order ${label} is invalid.`);
    }
    quantities.set(slug, total);
  }
  return quantities;
}

function assertReservationAllocationBinding(allocations, orderItems) {
  const reserved = itemQuantities(allocations, "reservation allocation");
  const ordered = itemQuantities(orderItems, "inventory binding");
  if (reserved.size !== ordered.size) {
    throw new Error("Payment order reservation does not match its inventory.");
  }
  for (const [slug, quantity] of ordered) {
    if (reserved.get(slug) !== quantity) {
      throw new Error("Payment order reservation does not match its inventory.");
    }
  }
}

function nextPromotionUsage(promotion) {
  const usageCount = Number(promotion?.usageCount ?? 0);
  const usageLimit = Number(promotion?.usageLimit ?? 0);
  if (
    !Number.isSafeInteger(usageCount)
    || usageCount < 0
    || !Number.isSafeInteger(usageLimit)
    || usageLimit < 0
  ) {
    throw new Error("Payment order promotion usage is invalid.");
  }
  if (usageLimit > 0 && usageCount >= usageLimit) {
    throw new Error("Payment order promotion usage limit was reached.");
  }
  return usageCount + 1;
}

async function settleOrdinaryOrder(adapter, payment) {
  const documentId = payment.orderDocumentId || payment.subjectId;
  const order = await adapter.lockOrder(documentId);
  if (!order) throw new Error("Payment order not found.");
  adapter.assertBinding(order, payment);
  if (order.status === "paid" && order.paymentDocumentId === payment.documentId) {
    return { order, idempotent: true };
  }
  if (order.status !== "pending") throw new Error("Payment order is not pending.");
  if (typeof order.reservationToken !== "string" || !order.reservationToken) {
    throw new Error("Payment order reservation binding is missing.");
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error("Payment order inventory binding is missing.");
  }

  await adapter.consumeReservation(
    order.reservationToken,
    order.orderNumber,
    order.items,
  );
  await adapter.decrementProductStock(order.items, order.orderNumber);
  if (order.promotionCode) {
    await adapter.incrementPromotionUse(order.promotionCode);
  }
  const statusHistory = Array.isArray(order.statusHistory)
    ? [...order.statusHistory]
    : [];
  statusHistory.push({
    id: `evt-${payment.documentId}-paid`,
    status: "paid",
    note: "Payment confirmed by verified settlement.",
    createdAt: payment.paidAt,
  });
  const updated = await adapter.updateOrder(documentId, {
    status: "paid",
    paymentDocumentId: payment.documentId,
    invoiceNumber: order.orderNumber.replace(/^JMR-/, "INV-"),
    statusHistory,
  });
  return { order: updated, idempotent: false };
}

module.exports = {
  assertReservationAllocationBinding,
  nextPromotionUsage,
  settleOrdinaryOrder,
};
