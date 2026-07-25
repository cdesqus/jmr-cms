"use strict";

const {
  publicTrackingProjection,
} = require("../../shipping-operations/services/tracking-domain.cjs");

const PUBLIC_ORDER_FIELDS = Object.freeze([
  "documentId",
  "orderNumber",
  "trackingNumber",
  "carrier",
  "customerName",
  "email",
  "status",
  "currency",
  "subtotalCents",
  "shippingCents",
  "discountCents",
  "promotionCode",
  "totalCents",
  "invoiceNumber",
  "items",
  "statusHistory",
  "batchAllocations",
  "fulfilmentChecklist",
  "packedBy",
  "packedAt",
  "itemsSummary",
  "shippingAddressText",
  "estimatedDelivery",
  "createdAt",
  "updatedAt",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicOrderFields(order) {
  return Object.fromEntries(
    PUBLIC_ORDER_FIELDS
      .filter((field) => Object.hasOwn(order, field))
      .map((field) => [field, structuredClone(order[field])]),
  );
}

function createPublicOrderTrackingQuery({
  documents,
  enrichBatchAllocations = async (value) => value,
}) {
  if (typeof documents !== "function") {
    throw new TypeError("Document query factory is required.");
  }
  return async function findPublicTrackedOrder(value) {
    const query = text(value);
    if (!query || query.length > 255) {
      throw new TypeError("Tracking query is invalid.");
    }
    let orders = await documents("api::order.order").findMany({
      fields: PUBLIC_ORDER_FIELDS,
      filters: {
        $or: [
          { orderNumber: { $eqi: query } },
          { trackingNumber: { $eqi: query } },
        ],
      },
      limit: 1,
    });
    let shipment;
    if (!orders[0]) {
      const shipments = await documents("api::shipment.shipment").findMany({
        fields: [
          "documentId",
          "orderDocumentId",
          "carrier",
          "service",
          "awb",
          "status",
          "lastTrackingEventAt",
          "createdAt",
          "updatedAt",
        ],
        filters: { awb: { $eqi: query } },
        limit: 1,
      });
      shipment = shipments[0];
      if (!shipment?.orderDocumentId) return null;
      orders = await documents("api::order.order").findMany({
        fields: PUBLIC_ORDER_FIELDS,
        filters: { documentId: { $eq: shipment.orderDocumentId } },
        limit: 1,
      });
    }
    const rawOrder = orders[0];
    if (!rawOrder) return null;
    const order = publicOrderFields(rawOrder);
    if (!shipment) {
      const shipments = await documents("api::shipment.shipment").findMany({
        fields: [
          "documentId",
          "orderDocumentId",
          "carrier",
          "service",
          "awb",
          "status",
          "lastTrackingEventAt",
          "createdAt",
          "updatedAt",
        ],
        filters: { orderDocumentId: { $eq: order.documentId } },
        limit: 1,
      });
      shipment = shipments[0];
    }
    const events = shipment
      ? await documents("api::shipment-event.shipment-event").findMany({
          fields: ["status", "outcome", "occurredAt"],
          filters: {
            shipmentDocumentId: { $eq: shipment.documentId },
            outcome: { $eq: "applied" },
          },
          sort: ["occurredAt:asc"],
          limit: 250,
        })
      : [];
    const projected = publicTrackingProjection({
      shipment,
      events,
      legacyOrder: order,
    });
    const batchAllocations = await enrichBatchAllocations(
      order.batchAllocations,
    );
    if (!shipment) {
      return {
        ...order,
        batchAllocations,
        shipment: projected,
      };
    }
    const {
      trackingNumber: _legacyTrackingNumber,
      carrier: _legacyCarrier,
      ...safeOrder
    } = order;
    return {
      ...safeOrder,
      batchAllocations,
      shipment: projected,
    };
  };
}

module.exports = {
  PUBLIC_ORDER_FIELDS,
  createPublicOrderTrackingQuery,
};
