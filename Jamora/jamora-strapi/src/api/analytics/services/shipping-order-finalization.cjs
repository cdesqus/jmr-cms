"use strict";

const {
  assertReservationAllocationBinding,
} = require("../../payment-operations/services/order-payment-settlement.cjs");

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredOrderReservationToken(value, options = {}) {
  const token = text(value);
  if ((options.shippingEnabled || options.pendingPayment) &&
      (!token || token.length > 500)) {
    throw new Error("Stock reservation is required.");
  }
  return token || undefined;
}

function reservationExpiryForSelection(nowValue, selection) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  if (!Number.isFinite(now.getTime())) throw new Error("Reservation time is invalid.");
  const defaultExpiry = now.getTime() + 10 * 60 * 1000;
  const maximumExpiry = now.getTime() + 15 * 60 * 1000;
  const selectedExpiry = new Date(selection?.expiresAt).getTime();
  const expiry = Number.isFinite(selectedExpiry)
    ? Math.min(maximumExpiry, Math.max(defaultExpiry, selectedExpiry))
    : defaultExpiry;
  return new Date(expiry).toISOString();
}

function assertAllocationProductBinding(allocations, items) {
  const products = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const slug = text(item?.slug);
    const productDocumentId = text(
      item?.productId ?? item?.productDocumentId,
    );
    if (!slug || !productDocumentId) {
      throw new Error("Stock reservation product binding is invalid.");
    }
    const current = products.get(slug);
    if (current && current !== productDocumentId) {
      throw new Error("Stock reservation product binding is invalid.");
    }
    products.set(slug, productDocumentId);
  }
  for (const allocation of allocations) {
    if (products.get(text(allocation?.slug)) !==
        text(allocation?.productDocumentId)) {
      throw new Error("Stock reservation product binding does not match.");
    }
  }
}

function assertLiveReservationBinding(reservation, input) {
  if (!reservation || text(reservation.token) !== text(input.token) ||
      reservation.status !== "reserved") {
    throw new Error("Stock reservation expired or was already used.");
  }
  const now = input.now instanceof Date ? input.now : new Date(input.now);
  const expiresAt = new Date(reservation.expiresAt);
  if (!Number.isFinite(now.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      now >= expiresAt) {
    throw new Error("Stock reservation expired.");
  }
  if (text(reservation.email).toLowerCase() !== text(input.email).toLowerCase()) {
    throw new Error("Stock reservation customer binding does not match.");
  }
  const reservedCustomer = text(reservation.customerDocumentId);
  const orderCustomer = text(input.customerDocumentId);
  if ((reservedCustomer || orderCustomer) && reservedCustomer !== orderCustomer) {
    throw new Error("Stock reservation customer binding does not match.");
  }
  const reservedOrder = text(reservation.orderNumber);
  if (reservedOrder && reservedOrder !== text(input.orderNumber)) {
    throw new Error("Stock reservation order binding does not match.");
  }
  const allocations = Array.isArray(reservation.allocations)
    ? reservation.allocations
    : [];
  try {
    assertReservationAllocationBinding(allocations, input.items);
    assertAllocationProductBinding(allocations, input.items);
  } catch {
    throw new Error("Stock reservation does not match this order.");
  }
  if (input.shippingQuote !== undefined) {
    const quoteExpiresAt = new Date(input.shippingQuote?.expiresAt);
    if (!Number.isFinite(quoteExpiresAt.getTime())) {
      throw new Error("Shipping quote expiry is invalid.");
    }
    if (quoteExpiresAt > expiresAt) {
      throw new Error("Shipping quote cannot outlive its stock reservation.");
    }
  }
  return allocations;
}

function assertExistingOrderReplay(order, reservation, input) {
  if (!order || !reservation ||
      text(order.reservationToken) !== text(input.token) ||
      text(reservation.token) !== text(input.token) ||
      text(reservation.orderNumber) !== text(order.orderNumber)) {
    throw new Error("Order replay capability binding is invalid.");
  }
  if (text(order.email).toLowerCase() !== text(input.email).toLowerCase() ||
      text(reservation.email).toLowerCase() !== text(input.email).toLowerCase()) {
    throw new Error("Order replay customer binding is invalid.");
  }
  const customer = text(input.customerDocumentId);
  if (text(order.customerDocumentId) !== customer ||
      text(reservation.customerDocumentId) !== customer) {
    throw new Error("Order replay customer binding is invalid.");
  }
  const pending = order.status === "pending";
  if ((pending && reservation.status !== "reserved") ||
      (!pending && (order.status !== "paid" || reservation.status !== "consumed"))) {
    throw new Error("Order replay capability binding is invalid.");
  }
  if (pending) {
    const now = input.now instanceof Date ? input.now : new Date(input.now);
    const expiresAt = new Date(reservation.expiresAt);
    if (!Number.isFinite(now.getTime()) ||
        !Number.isFinite(expiresAt.getTime()) ||
        now >= expiresAt) {
      throw new Error("Order replay capability expired.");
    }
  }
  try {
    assertReservationAllocationBinding(reservation.allocations, order.items);
    assertAllocationProductBinding(reservation.allocations, order.items);
  } catch {
    throw new Error("Order replay inventory binding is invalid.");
  }
}

function exactAllocationUpdate(allocation, row) {
  const qty = Number(allocation?.qty);
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    throw new Error("Stock reservation allocation binding is invalid.");
  }
  if (allocation.batchDocumentId) {
    if (!row || row.documentId !== allocation.batchDocumentId) {
      throw new Error("Stock reservation batch binding is invalid.");
    }
    if (text(row.productDocumentId) !== text(allocation.productDocumentId) ||
        text(row.slug) !== text(allocation.slug)) {
      throw new Error("Stock reservation batch product binding is invalid.");
    }
    const quantity = Number(row.quantity);
    const reservedQuantity = Number(row.reservedQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < qty) {
      throw new Error("Reserved batch stock is unavailable.");
    }
    if (!Number.isSafeInteger(reservedQuantity) || reservedQuantity < qty) {
      throw new Error("Stock reservation batch binding is invalid.");
    }
    const nextQuantity = quantity - qty;
    return {
      kind: "batch",
      documentId: row.documentId,
      quantity: nextQuantity,
      reservedQuantity: reservedQuantity - qty,
      status: nextQuantity === 0 ? "depleted" : row.status,
    };
  }
  if (!row || row.documentId !== allocation.productDocumentId ||
      text(row.slug) !== text(allocation.slug)) {
    throw new Error("Stock reservation product binding is invalid.");
  }
  const stock = Number(row.stock);
  if (!Number.isSafeInteger(stock) || stock < qty) {
    throw new Error("Reserved product stock is unavailable.");
  }
  return {
    kind: "product",
    documentId: row.documentId,
    stock: stock - qty,
  };
}

module.exports = {
  assertExistingOrderReplay,
  assertLiveReservationBinding,
  exactAllocationUpdate,
  reservationExpiryForSelection,
  requiredOrderReservationToken,
};
