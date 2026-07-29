"use strict";

const MAX_LABEL_BYTES = 5 * 1024 * 1024;

function safeSegment(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\");
}

function safeCapability(value) {
  return typeof value === "string" &&
    value.length <= 4_096 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function safeAwb(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,255}$/.test(value)
    ? value
    : "shipment";
}

function packingProgressPayload({ packedBy, fulfilmentChecklist }) {
  return {
    packedBy,
    fulfilmentChecklist,
  };
}

async function createPrivateShipmentLabel({
  orderDocumentId,
  packingComplete,
  fetcher = globalThis.fetch,
}) {
  if (!packingComplete) throw new Error("Complete packing before creating a shipment.");
  if (!safeSegment(orderDocumentId)) throw new Error("Invalid order reference.");
  if (typeof fetcher !== "function") throw new TypeError("Fetch is required.");

  const createdResponse = await fetcher(
    `/admin/api/shipping/shipments/${encodeURIComponent(orderDocumentId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  if (!createdResponse?.ok) throw new Error("Could not create shipment label.");
  const created = await createdResponse.json().catch(() => null);
  const shipmentId = created?.shipment?.documentId;
  if (!safeSegment(shipmentId) ||
      !Array.isArray(created?.shipment?.labelFormats) ||
      !created.shipment.labelFormats.includes("pdf")) {
    throw new Error("Invalid shipment response.");
  }

  const capabilityResponse = await fetcher(
    `/admin/api/shipping/shipments/${encodeURIComponent(shipmentId)}/labels/capability`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "pdf" }),
    },
  );
  if (!capabilityResponse?.ok) throw new Error("Could not create shipment label.");
  const issued = await capabilityResponse.json().catch(() => null);
  if (!safeCapability(issued?.capability) || issued?.format !== "pdf") {
    throw new Error("Invalid label capability response.");
  }

  const labelResponse = await fetcher(
    `/admin/api/shipping/shipments/${encodeURIComponent(shipmentId)}/labels?capability=${encodeURIComponent(issued.capability)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!labelResponse?.ok) throw new Error("Could not create shipment label.");
  const contentType = labelResponse.headers?.get("content-type")?.split(";")[0];
  const declaredLength = Number(labelResponse.headers?.get("content-length"));
  if (contentType !== "application/pdf" ||
      Number.isFinite(declaredLength) && declaredLength > MAX_LABEL_BYTES) {
    throw new Error("Invalid private label response.");
  }
  const blob = await labelResponse.blob();
  if (blob.size < 1 || blob.size > MAX_LABEL_BYTES) {
    throw new Error("Invalid private label response.");
  }
  const magic = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (magic.length !== 5 ||
      magic[0] !== 0x25 ||
      magic[1] !== 0x50 ||
      magic[2] !== 0x44 ||
      magic[3] !== 0x46 ||
      magic[4] !== 0x2d) {
    throw new Error("Invalid private label response.");
  }
  return {
    blob,
    filename: `${safeAwb(created.shipment.awb)}-label.pdf`,
  };
}

module.exports = {
  createPrivateShipmentLabel,
  packingProgressPayload,
};
