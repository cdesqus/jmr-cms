"use strict";

const LABEL_FORMATS = new Set(["pdf", "zpl"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isShippingEnabled(env = process.env) {
  return env.SHIPPING_ENABLED === "true";
}

function canManageShipping(identity) {
  return identity?.role === "owner" || identity?.role === "warehouse";
}

function safeSegment(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\");
}

function shippingAdminOperation(method, segments, input) {
  const path = Array.isArray(segments) ? segments : [];
  if (method === "POST" &&
      path.length === 2 &&
      path[0] === "shipments" &&
      safeSegment(path[1])) {
    return {
      kind: "create",
      targetPath: `/api/jamora/admin/shipping/shipments/${encodeURIComponent(path[1])}`,
    };
  }
  if (method === "POST" &&
      path.length === 4 &&
      path[0] === "shipments" &&
      safeSegment(path[1]) &&
      path[2] === "labels" &&
      path[3] === "capability") {
    const format = text(input?.format).toLowerCase();
    if (!LABEL_FORMATS.has(format)) {
      throw new TypeError("Label format must be PDF or ZPL.");
    }
    return {
      kind: "capability",
      targetPath: `/api/jamora/admin/shipping/shipments/${encodeURIComponent(path[1])}/labels/capability`,
      body: JSON.stringify({ format }),
    };
  }
  if (method === "GET" &&
      path.length === 3 &&
      path[0] === "shipments" &&
      safeSegment(path[1]) &&
      path[2] === "labels") {
    return {
      kind: "download",
      targetPath: `/api/jamora/admin/shipping/shipments/${encodeURIComponent(path[1])}/labels`,
    };
  }
  throw new Error("Shipping admin operation is not allowed.");
}

function assertLabelCapability(value) {
  const capability = text(value);
  if (!capability) throw new TypeError("Label capability is required.");
  if (capability.length > 4_096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(capability)) {
    throw new TypeError("Label capability is invalid.");
  }
  return capability;
}

function safeShipmentMutationResponse(value, kind) {
  if (kind === "capability") {
    const format = text(value?.format).toLowerCase();
    return {
      capability: text(value?.capability),
      expiresAt: text(value?.expiresAt),
      format: LABEL_FORMATS.has(format) ? format : "",
    };
  }
  const shipment = value?.shipment ?? {};
  return {
    idempotent: value?.idempotent === true,
    shipment: {
      documentId: shipment.documentId,
      orderDocumentId: shipment.orderDocumentId,
      orderNumber: shipment.orderNumber,
      carrier: shipment.carrier,
      service: shipment.service,
      awb: shipment.awb,
      status: shipment.status,
      labelFormats: Array.isArray(shipment.labelFormats)
        ? [...new Set(shipment.labelFormats.filter((format) => LABEL_FORMATS.has(format)))]
        : [],
    },
  };
}

function shippingProviderError() {
  return "Shipping service unavailable.";
}

function shippingRequestFailure(error) {
  if (error?.status === 413 || error?.status === 400) {
    return {
      status: error.status,
      message: typeof error.message === "string"
        ? error.message
        : "Invalid request.",
    };
  }
  if (error instanceof TypeError) {
    return { status: 400, message: error.message };
  }
  return { status: 404, message: "Not found." };
}

module.exports = {
  assertLabelCapability,
  canManageShipping,
  isShippingEnabled,
  safeShipmentMutationResponse,
  shippingAdminOperation,
  shippingProviderError,
  shippingRequestFailure,
};
