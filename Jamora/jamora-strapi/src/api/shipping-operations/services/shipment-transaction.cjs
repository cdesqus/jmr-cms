"use strict";

const {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} = require("node:crypto");

const LABEL_CONTENT_TYPES = Object.freeze({
  pdf: "application/pdf",
  zpl: "application/vnd.zebra-zpl",
});
const DEFAULT_CAPABILITY_TTL_SECONDS = 60;
const MAX_LABEL_BYTES = 5 * 1024 * 1024;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError("Valid operation time is required.");
  return parsed.toISOString();
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(String(left), "utf8");
  const rightBytes = Buffer.from(String(right), "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function providerIdentifier(value) {
  const identifier = text(value);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(identifier)
    ? identifier
    : "";
}

function assertActor(value) {
  const actor = text(value);
  if (!actor) throw new TypeError("Shipment actor is required.");
  return actor;
}

function assertDocumentId(value, label) {
  const documentId = text(value);
  if (!documentId || documentId.length > 255) {
    throw new TypeError(`${label} is required.`);
  }
  return documentId;
}

function assertFormat(value) {
  const format = text(value).toLowerCase();
  if (!Object.hasOwn(LABEL_CONTENT_TYPES, format)) {
    throw new TypeError("Label format must be PDF or ZPL.");
  }
  return format;
}

function packingKey(value) {
  return [
    text(value?.productId ?? value?.productDocumentId),
    text(value?.sku),
    text(value?.batchDocumentId),
    text(value?.batchNumber),
  ].join("\u0000");
}

function assertExactPacking(order, products, batches) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const allocations = Array.isArray(order?.batchAllocations)
    ? order.batchAllocations
    : [];
  const checklist = Array.isArray(order?.fulfilmentChecklist)
    ? order.fulfilmentChecklist
    : [];
  if (!items.length || !allocations.length || !checklist.length) {
    throw new Error("A completed authoritative packing checklist is required.");
  }

  const productRows = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const documentId = text(product?.documentId);
    if (!documentId || productRows.has(documentId)) {
      throw new Error("Packing product inventory binding is invalid.");
    }
    productRows.set(documentId, product);
  }
  const itemRows = new Map();
  for (const item of items) {
    const productId = text(item?.productId ?? item?.productDocumentId);
    const slug = text(item?.slug);
    const sku = text(item?.sku);
    const name = text(item?.name);
    const qty = Number(item?.qty);
    const product = productRows.get(productId);
    if (!productId || !slug || !sku || !name ||
        !Number.isSafeInteger(qty) || qty <= 0 ||
        !product ||
        text(product.documentId) !== productId ||
        text(product.slug) !== slug ||
        text(product.sku) !== sku ||
        text(product.name) !== name ||
        itemRows.has(productId)) {
      throw new Error("Packing product inventory binding is invalid.");
    }
    itemRows.set(productId, { productId, slug, sku, name, qty });
  }
  if (productRows.size !== itemRows.size) {
    throw new Error("Packing product inventory binding is invalid.");
  }

  const batchRows = new Map();
  for (const batch of Array.isArray(batches) ? batches : []) {
    const documentId = text(batch?.documentId);
    if (!documentId || batchRows.has(documentId)) {
      throw new Error("Packing batch inventory binding is invalid.");
    }
    batchRows.set(documentId, batch);
  }
  const expected = new Map();
  const allocatedByProduct = new Map();
  const referencedBatches = new Set();
  for (const allocation of allocations) {
    const productId = text(allocation?.productDocumentId);
    const item = itemRows.get(productId);
    const qty = Number(allocation?.qty);
    const batchDocumentId = text(allocation?.batchDocumentId);
    const batchNumber = text(allocation?.batchNumber);
    if (!item ||
        text(allocation?.slug) !== item.slug ||
        text(allocation?.sku) !== item.sku ||
        text(allocation?.name) !== item.name ||
        !Number.isSafeInteger(qty) ||
        qty <= 0 ||
        !batchNumber) {
      throw new Error("Packing allocation binding is invalid.");
    }
    if (batchDocumentId) {
      const batch = batchRows.get(batchDocumentId);
      referencedBatches.add(batchDocumentId);
      if (!batch ||
          text(batch.productDocumentId) !== productId ||
          text(batch.slug) !== item.slug ||
          text(batch.sku) !== item.sku ||
          text(batch.batchNumber) !== batchNumber) {
        throw new Error("Packing batch inventory binding is invalid.");
      }
    } else if (batchNumber !== "LEGACY-STOCK") {
      throw new Error("Packing batch inventory binding is invalid.");
    }
    const line = {
      productId,
      sku: item.sku,
      name: item.name,
      batchDocumentId,
      batchNumber,
      qty,
    };
    const key = packingKey(line);
    if (expected.has(key)) {
      throw new Error("Packing allocation binding is duplicated.");
    }
    expected.set(key, line);
    allocatedByProduct.set(
      productId,
      (allocatedByProduct.get(productId) ?? 0) + qty,
    );
  }
  if (batchRows.size !== referencedBatches.size) {
    throw new Error("Packing batch inventory binding is invalid.");
  }
  for (const item of itemRows.values()) {
    if (allocatedByProduct.get(item.productId) !== item.qty) {
      throw new Error("Packing allocation quantity binding is invalid.");
    }
  }
  if (checklist.length !== expected.size) {
    throw new Error("Packing checklist has missing or extra rows.");
  }
  const seen = new Set();
  for (const line of checklist) {
    const key = packingKey(line);
    const authoritative = expected.get(key);
    const qty = Number(line?.qty);
    const scannedQty = Number(line?.scannedQty);
    if (!authoritative ||
        seen.has(key) ||
        text(line?.name) !== authoritative.name ||
        qty !== authoritative.qty ||
        !Number.isSafeInteger(qty) ||
        line?.checked !== true ||
        !Number.isSafeInteger(scannedQty) ||
        scannedQty !== authoritative.qty) {
      throw new Error("Packing checklist does not match authoritative inventory.");
    }
    seen.add(key);
  }
}

function assertPaidAndPacked(order, payment, providerCarrier, inventory) {
  const membershipPaid = Boolean(text(order?.membershipDocumentId)) &&
    Boolean(text(order?.checkoutReference)) &&
    text(order?.membershipSnapshot?.membershipDocumentId) ===
      text(order?.membershipDocumentId) &&
    text(order?.membershipSnapshot?.checkoutReference) ===
      text(order?.checkoutReference);
  const paymentDocumentId = text(order?.paymentDocumentId);
  const charge = order?.priceSnapshot?.charge;
  const chargeCurrency = text(charge?.currency).toUpperCase();
  const paidProof = paymentDocumentId
    ? payment?.documentId === paymentDocumentId &&
      payment?.status === "paid" &&
      payment?.subjectType === "order" &&
      text(payment?.orderDocumentId || payment?.subjectId) === order?.documentId &&
      Number.isSafeInteger(charge?.amountMinor) &&
      charge.amountMinor >= 0 &&
      payment?.amountMinor === charge.amountMinor &&
      ["RON", "EUR"].includes(chargeCurrency) &&
      text(payment?.currency).toUpperCase() === chargeCurrency
    : order?.stripeSessionId === "mock-paid-checkout" || membershipPaid;
  if (!order || !["paid", "processing"].includes(order.status) || !paidProof) {
    throw new Error("A paid order is required to create a shipment.");
  }
  const packedAtText = text(order.packedAt);
  const packedAt = new Date(packedAtText);
  const packed = Boolean(packedAtText) &&
    Number.isFinite(packedAt.getTime()) &&
    Boolean(text(order.packedBy));
  if (!packed) throw new Error("A completed packed order is required to create a shipment.");
  assertExactPacking(order, inventory?.products, inventory?.batches);
  if (text(order.shippingSnapshot?.carrier) !== providerCarrier ||
      !text(order.shippingSnapshot?.service)) {
    throw new Error("Order shipping carrier is not handled by this provider.");
  }
}

function assertProviderShipment(value, carrier) {
  const awb = text(value?.awb);
  const labelReference = text(value?.labelReference);
  const formats = Array.isArray(value?.labelFormats)
    ? [...new Set(value.labelFormats.map((format) => assertFormat(format)))]
    : [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(awb) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{7,254}$/.test(labelReference)) {
    throw new Error("Shipping provider returned an invalid shipment.");
  }
  if (!formats.length) throw new Error("Shipping provider returned no supported label format.");
  return {
    carrier,
    awb,
    labelReference,
    labelFormats: formats,
  };
}

function safeShipment(shipment) {
  return {
    documentId: shipment.documentId,
    orderDocumentId: shipment.orderDocumentId,
    orderNumber: shipment.orderNumber,
    carrier: shipment.carrier,
    service: shipment.service,
    awb: shipment.awb,
    status: shipment.status,
    labelFormats: Array.isArray(shipment.labelFormats)
      ? shipment.labelFormats.filter((format) => Object.hasOwn(LABEL_CONTENT_TYPES, format))
      : [],
    createdAt: shipment.createdAt,
  };
}

function shippedOrderPatch(order, shipment, actor, occurredAt) {
  const history = Array.isArray(order.statusHistory)
    ? structuredClone(order.statusHistory)
    : [];
  const note = `Shipment ${shipment.awb} created.`;
  const alreadyRecorded = history.some((event) =>
    event?.status === "shipped" && event?.note === note,
  );
  if (!alreadyRecorded) {
    history.push({
      type: "status",
      status: "shipped",
      note,
      actor,
      occurredAt,
    });
  }
  return {
    status: "shipped",
    carrier: shipment.carrier,
    trackingNumber: shipment.awb,
    statusHistory: history,
  };
}

function existingShipmentReplay(order, shipment, providerCarrier) {
  let validated;
  try {
    validated = assertProviderShipment(shipment, providerCarrier);
  } catch {
    throw new Error("Existing shipment binding is invalid.");
  }
  const expectedOrderNumber = text(order.orderNumber) || order.documentId;
  if (text(shipment.orderDocumentId) !== order.documentId ||
      text(shipment.orderNumber) !== expectedOrderNumber ||
      text(shipment.provider) !== providerCarrier ||
      text(shipment.carrier) !== providerCarrier ||
      validated.carrier !== providerCarrier ||
      text(shipment.service) !== text(order.shippingSnapshot?.service) ||
      text(order.shippingSnapshot?.carrier) !== providerCarrier) {
    throw new Error("Existing shipment binding is invalid.");
  }

  const orderCarrier = text(order.carrier);
  const orderTracking = text(order.trackingNumber);
  if ((orderCarrier && orderCarrier !== shipment.carrier) ||
      (orderTracking && orderTracking !== shipment.awb)) {
    throw new Error("Existing shipment order binding is invalid.");
  }
  if (["paid", "processing"].includes(order.status)) {
    return { repair: true };
  }
  if (["shipped", "fulfilled", "refunded", "failed"].includes(order.status)) {
    if (orderCarrier !== shipment.carrier || orderTracking !== shipment.awb) {
      throw new Error("Existing shipment order binding is invalid.");
    }
    return { repair: false };
  }
  throw new Error("Existing shipment order state is invalid.");
}

function capabilitySignature(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function capabilityToken(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${capabilitySignature(encoded, secret)}`;
}

function parseCapability(token, secret) {
  const value = text(token);
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] ||
      !safeEqual(parts[1], capabilitySignature(parts[0], secret))) {
    throw new Error("Invalid label capability.");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid label capability.");
  }
  if (payload?.v !== 1 ||
      payload?.purpose !== "shipment_label_download" ||
      typeof payload?.shipment !== "string" ||
      typeof payload?.nonce !== "string" ||
      !Number.isSafeInteger(payload?.expiresAt)) {
    throw new Error("Invalid label capability.");
  }
  payload.format = assertFormat(payload.format);
  return { payload, token: value };
}

function createShipmentTransactions({
  adapter,
  provider,
  capabilitySecret,
  capabilityTtlSeconds = DEFAULT_CAPABILITY_TTL_SECONDS,
}) {
  if (!adapter?.transaction ||
      !adapter?.findPendingCompensationsByOrder ||
      !adapter?.recordCompensation ||
      !adapter?.markCompensationAttempt ||
      !adapter?.resolveCompensation) {
    throw new TypeError("Shipment adapter is required.");
  }
  const carrier = text(provider?.carrier);
  if (!carrier || !provider?.createShipment || !provider?.cancelShipment ||
      !provider?.downloadLabel) {
    throw new TypeError("Shipping provider is required.");
  }
  const secret = text(capabilitySecret);
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new TypeError("A label capability secret of at least 32 bytes is required.");
  }
  if (!Number.isSafeInteger(capabilityTtlSeconds) ||
      capabilityTtlSeconds < 1 ||
      capabilityTtlSeconds > 300) {
    throw new TypeError("Label capability TTL must be between 1 and 300 seconds.");
  }

  async function cancelAllocation(allocation) {
    await provider.cancelShipment({
      ...(allocation.awb ? { awb: allocation.awb } : {}),
      ...(allocation.labelReference
        ? { labelReference: allocation.labelReference }
        : {}),
    });
  }

  async function retryPendingCompensation(orderDocumentId, attemptedAt) {
    const intents = await adapter.findPendingCompensationsByOrder(
      orderDocumentId,
    );
    if (!Array.isArray(intents) || intents.length > 25) {
      throw new Error("Shipment compensation binding is invalid.");
    }
    for (const intent of intents) {
      const awb = providerIdentifier(intent.awb);
      const labelReference = providerIdentifier(intent.labelReference);
      if (text(intent.orderDocumentId) !== orderDocumentId ||
          text(intent.provider) !== carrier ||
          (!awb && !labelReference)) {
        throw new Error("Shipment compensation binding is invalid.");
      }
      try {
        await cancelAllocation({ awb, labelReference });
      } catch {
        await adapter.markCompensationAttempt(intent.documentId, attemptedAt);
        throw new Error("Pending shipment compensation cleanup failed.");
      }
      await adapter.resolveCompensation(intent.documentId, attemptedAt);
    }
  }

  return {
    async createShipment({ orderDocumentId, actor, now = new Date() }) {
      const orderId = assertDocumentId(orderDocumentId, "Order document ID");
      const createdBy = assertActor(actor);
      const createdAt = iso(now);
      return adapter.transaction(async (tx) => {
        let providerShipment;
        try {
          const candidate = await tx.findOrder(orderId);
          const candidatePaymentId = text(candidate?.paymentDocumentId);
          const payment = candidatePaymentId
            ? await tx.lockPayment(candidatePaymentId)
            : null;
          const order = await tx.lockOrder(orderId);
          if (!order) throw new Error("Order not found.");
          if (text(order.paymentDocumentId) !== candidatePaymentId) {
            throw new Error("A paid order is required to create a shipment.");
          }
          const existing = await tx.findShipmentByOrder(orderId);
          if (existing) {
            const replay = existingShipmentReplay(order, existing, carrier);
            if (replay.repair) {
              await tx.updateOrder(
                order.documentId,
                shippedOrderPatch(order, existing, createdBy, createdAt),
              );
            }
            return { idempotent: true, shipment: safeShipment(existing) };
          }
          await retryPendingCompensation(orderId, createdAt);
          const productIds = [...new Set(order.items.map((item) =>
            text(item?.productId ?? item?.productDocumentId),
          ))].sort();
          const batchIds = [...new Set(order.batchAllocations.map((allocation) =>
            text(allocation?.batchDocumentId),
          ).filter(Boolean))].sort();
          const batches = await tx.lockPackingBatches(batchIds);
          const products = await tx.lockPackingProducts(productIds);
          assertPaidAndPacked(order, payment, carrier, { products, batches });
          const providerResult = await provider.createShipment(
            structuredClone(order),
          );
          providerShipment = {
            awb: text(providerResult?.awb),
            labelReference: text(providerResult?.labelReference),
          };
          providerShipment = assertProviderShipment(providerResult, carrier);
          const shipment = await tx.createShipment({
            orderDocumentId: order.documentId,
            orderNumber: text(order.orderNumber) || order.documentId,
            provider: carrier,
            carrier: providerShipment.carrier,
            service: text(order.shippingSnapshot.service),
            awb: providerShipment.awb,
            labelReference: providerShipment.labelReference,
            labelFormats: providerShipment.labelFormats,
            status: "label_created",
            createdByActor: createdBy,
            createdAt,
          });
          await tx.updateOrder(
            order.documentId,
            shippedOrderPatch(order, shipment, createdBy, createdAt),
          );
          return { idempotent: false, shipment: safeShipment(shipment) };
        } catch (error) {
          const allocation = {
            awb: providerIdentifier(providerShipment?.awb),
            labelReference: providerIdentifier(providerShipment?.labelReference),
          };
          if (allocation.awb || allocation.labelReference) {
            try {
              await cancelAllocation(allocation);
            } catch {
              const compensationKey = hash(JSON.stringify({
                orderDocumentId: orderId,
                provider: carrier,
                awb: allocation.awb,
                labelReference: allocation.labelReference,
              }));
              try {
                await adapter.recordCompensation({
                  compensationKey,
                  orderDocumentId: orderId,
                  provider: carrier,
                  ...allocation,
                  status: "pending",
                  attempts: 1,
                  createdAt,
                  lastAttemptAt: createdAt,
                });
              } catch {
                adapter.logCompensationFailure?.({
                  orderDocumentId: orderId,
                  provider: carrier,
                  awb: allocation.awb,
                });
              }
            }
          }
          throw error;
        }
      });
    },

    async createLabelCapability({
      shipmentDocumentId,
      format,
      actor,
      now = new Date(),
    }) {
      const shipmentId = assertDocumentId(
        shipmentDocumentId,
        "Shipment document ID",
      );
      const selectedFormat = assertFormat(format);
      const issuedBy = assertActor(actor);
      const issuedAt = new Date(iso(now));
      const expiresAt = new Date(
        issuedAt.getTime() + capabilityTtlSeconds * 1_000,
      );
      return adapter.transaction(async (tx) => {
        const shipment = await tx.lockShipment(shipmentId);
        if (!shipment) throw new Error("Shipment not found.");
        if (!Array.isArray(shipment.labelFormats) ||
            !shipment.labelFormats.includes(selectedFormat)) {
          throw new Error("Label format is unavailable for this shipment.");
        }
        const token = capabilityToken({
          v: 1,
          purpose: "shipment_label_download",
          shipment: shipment.documentId,
          format: selectedFormat,
          nonce: randomBytes(24).toString("base64url"),
          expiresAt: expiresAt.getTime(),
        }, secret);
        await tx.updateShipment(shipment.documentId, {
          labelCapabilityHash: hash(token),
          labelCapabilityExpiresAt: expiresAt.toISOString(),
          labelCapabilityUsedAt: null,
          labelCapabilityIssuedBy: issuedBy,
        });
        return {
          capability: token,
          expiresAt: expiresAt.toISOString(),
          format: selectedFormat,
        };
      });
    },

    async downloadLabel({
      shipmentDocumentId,
      capability,
      now = new Date(),
    }) {
      const shipmentId = assertDocumentId(
        shipmentDocumentId,
        "Shipment document ID",
      );
      const current = new Date(iso(now));
      const parsed = parseCapability(capability, secret);
      if (!safeEqual(parsed.payload.shipment, shipmentId)) {
        throw new Error("Invalid label capability.");
      }
      if (parsed.payload.expiresAt <= current.getTime()) {
        throw new Error("Expired label capability.");
      }
      const shipment = await adapter.transaction(async (tx) => {
        const locked = await tx.lockShipment(shipmentId);
        if (!locked ||
            !text(locked.labelCapabilityHash) ||
            !safeEqual(locked.labelCapabilityHash, hash(parsed.token))) {
          throw new Error("Invalid label capability.");
        }
        const storedExpiry = new Date(locked.labelCapabilityExpiresAt);
        if (!Number.isFinite(storedExpiry.getTime()) || storedExpiry <= current) {
          throw new Error("Expired label capability.");
        }
        if (locked.labelCapabilityUsedAt) {
          throw new Error("Used label capability.");
        }
        if (!Array.isArray(locked.labelFormats) ||
            !locked.labelFormats.includes(parsed.payload.format)) {
          throw new Error("Label format is unavailable for this shipment.");
        }
        await tx.updateShipment(locked.documentId, {
          labelCapabilityUsedAt: current.toISOString(),
        });
        return structuredClone(locked);
      });
      const downloaded = await provider.downloadLabel({
        awb: shipment.awb,
        labelReference: shipment.labelReference,
        format: parsed.payload.format,
      });
      const expectedContentType = LABEL_CONTENT_TYPES[parsed.payload.format];
      if (downloaded?.contentType !== expectedContentType) {
        throw new Error("Shipping provider returned an invalid label content type.");
      }
      const body = Buffer.isBuffer(downloaded?.body)
        ? downloaded.body
        : downloaded?.body instanceof Uint8Array
          ? Buffer.from(downloaded.body)
          : null;
      if (!body || body.length < 1 || body.length > MAX_LABEL_BYTES) {
        throw new Error("Shipping provider returned an invalid label document.");
      }
      return {
        contentType: expectedContentType,
        filename: `${safeFilename(shipment.orderNumber || shipment.awb)}-label.${parsed.payload.format}`,
        body,
      };
    },
  };
}

function safeFilename(value) {
  const safe = text(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "shipment";
}

function mockPdf(label) {
  const stream = `BT\n/F1 12 Tf\n30 100 Td\n(${label}) Tj\nET\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 210] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const header = "%PDF-1.4\n";
  const offsets = [];
  let offset = Buffer.byteLength(header, "utf8");
  for (const object of objects) {
    offsets.push(offset);
    offset += Buffer.byteLength(object, "utf8");
  }
  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    ...offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n `),
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    String(offset),
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.from(`${header}${objects.join("")}${xref}`, "utf8");
}

function createMockShippingProvider() {
  return {
    carrier: "jamora-mock",
    async createShipment(order) {
      const basis = JSON.stringify({
        order: order.documentId,
        number: order.orderNumber,
        service: order.shippingSnapshot?.service,
      });
      const digest = createHash("sha256").update(basis).digest();
      const numericAwb = (
        BigInt(`0x${digest.subarray(0, 8).toString("hex")}`) %
        (10n ** 18n)
      ).toString().padStart(18, "0");
      return {
        awb: `JMR${numericAwb}`,
        labelReference: `lbl_${digest.toString("base64url")}`,
        labelFormats: ["pdf", "zpl"],
      };
    },
    async cancelShipment() {},
    async downloadLabel({ awb, labelReference, format }) {
      const selectedFormat = assertFormat(format);
      const safeAwb = text(awb).replace(/[^A-Za-z0-9_-]/g, "");
      const safeReference = text(labelReference).replace(/[^A-Za-z0-9_-]/g, "");
      if (!safeAwb || !safeReference) throw new Error("Mock shipment label reference is invalid.");
      if (selectedFormat === "zpl") {
        return {
          contentType: LABEL_CONTENT_TYPES.zpl,
          body: Buffer.from(
            `^XA\n^FO40,40^A0N,32,32^FDJamora shipment^FS\n^FO40,90^BY2^BCN,80,Y,N,N^FD${safeAwb}^FS\n^FO40,200^A0N,20,20^FD${safeReference}^FS\n^XZ`,
            "utf8",
          ),
        };
      }
      const label = `Jamora shipment ${safeAwb} ${safeReference}`;
      return {
        contentType: LABEL_CONTENT_TYPES.pdf,
        body: mockPdf(label),
      };
    },
  };
}

function createMemoryShipmentAdapter({
  orders = [],
  payments = [],
  products = [],
  batches = [],
  shipments = [],
  compensations = [],
  failCreateShipment = false,
  failUpdateOrder = false,
  failRecordCompensation = false,
} = {}) {
  const adapter = {
    orders: new Map(orders.map((order) => [order.documentId, structuredClone(order)])),
    payments: new Map(payments.map((payment) => [
      payment.documentId,
      structuredClone(payment),
    ])),
    products: new Map(products.map((product) => [
      product.documentId,
      structuredClone(product),
    ])),
    batches: new Map(batches.map((batch) => [
      batch.documentId,
      structuredClone(batch),
    ])),
    compensations: new Map(compensations.map((intent) => [
      intent.documentId,
      structuredClone(intent),
    ])),
    shipments: new Map(shipments.map((shipment) => [
      shipment.documentId,
      structuredClone(shipment),
    ])),
    queue: Promise.resolve(),
    sequence: shipments.length,
    compensationSequence: compensations.length,
    compensationLogs: [],
    lockLog: [],
    failures: {
      failCreateShipment,
      failUpdateOrder,
      failRecordCompensation,
    },
    async findPendingCompensationsByOrder(orderDocumentId) {
      return [...adapter.compensations.values()]
        .filter((candidate) =>
          candidate.orderDocumentId === orderDocumentId &&
          candidate.status === "pending")
        .sort((left, right) =>
          text(left.createdAt).localeCompare(text(right.createdAt)))
        .slice(0, 26)
        .map((intent) => structuredClone(intent));
    },
    async recordCompensation(data) {
      if (adapter.failures.failRecordCompensation) {
        throw new Error("Simulated compensation persistence failure.");
      }
      const existing = [...adapter.compensations.values()].find((candidate) =>
        candidate.compensationKey === data.compensationKey,
      );
      if (existing) {
        Object.assign(existing, structuredClone(data));
        return structuredClone(existing);
      }
      adapter.compensationSequence += 1;
      const intent = {
        documentId: `shipment-compensation-${adapter.compensationSequence}`,
        ...structuredClone(data),
      };
      adapter.compensations.set(intent.documentId, intent);
      return structuredClone(intent);
    },
    logCompensationFailure(input) {
      adapter.compensationLogs.push(structuredClone(input));
    },
    async markCompensationAttempt(documentId, attemptedAt) {
      const intent = adapter.compensations.get(documentId);
      if (!intent || intent.status !== "pending") {
        throw new Error("Shipment compensation not found.");
      }
      intent.attempts += 1;
      intent.lastAttemptAt = attemptedAt;
      return structuredClone(intent);
    },
    async resolveCompensation(documentId, attemptedAt) {
      const intent = adapter.compensations.get(documentId);
      if (!intent || intent.status !== "pending") {
        throw new Error("Shipment compensation not found.");
      }
      intent.attempts += 1;
      intent.lastAttemptAt = attemptedAt;
      intent.status = "resolved";
      intent.resolvedAt = attemptedAt;
      return structuredClone(intent);
    },
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const orderSnapshot = structuredClone([...adapter.orders]);
      const paymentSnapshot = structuredClone([...adapter.payments]);
      const productSnapshot = structuredClone([...adapter.products]);
      const batchSnapshot = structuredClone([...adapter.batches]);
      const shipmentSnapshot = structuredClone([...adapter.shipments]);
      const sequenceSnapshot = adapter.sequence;
      try {
        return await work(memoryTransaction(adapter, adapter.failures));
      } catch (error) {
        adapter.orders = new Map(orderSnapshot);
        adapter.payments = new Map(paymentSnapshot);
        adapter.products = new Map(productSnapshot);
        adapter.batches = new Map(batchSnapshot);
        adapter.shipments = new Map(shipmentSnapshot);
        adapter.sequence = sequenceSnapshot;
        throw error;
      } finally {
        release();
      }
    },
  };
  return adapter;
}

function memoryTransaction(adapter, failures) {
  return {
    async findOrder(documentId) {
      const order = adapter.orders.get(documentId);
      return order ? structuredClone(order) : null;
    },
    async lockPayment(documentId) {
      const payment = adapter.payments.get(documentId);
      return payment ? structuredClone(payment) : null;
    },
    async lockOrder(documentId) {
      const order = adapter.orders.get(documentId);
      return order ? structuredClone(order) : null;
    },
    async lockPackingProducts(documentIds) {
      adapter.lockLog.push("products");
      return documentIds
        .map((documentId) => adapter.products.get(documentId))
        .filter(Boolean)
        .map((product) => structuredClone(product));
    },
    async lockPackingBatches(documentIds) {
      adapter.lockLog.push("batches");
      return documentIds
        .map((documentId) => adapter.batches.get(documentId))
        .filter(Boolean)
        .map((batch) => structuredClone(batch));
    },
    async findShipmentByOrder(orderDocumentId) {
      const shipment = [...adapter.shipments.values()]
        .find((candidate) => candidate.orderDocumentId === orderDocumentId);
      return shipment ? structuredClone(shipment) : null;
    },
    async createShipment(data) {
      if (failures.failCreateShipment) {
        throw new Error("Simulated shipment persistence failure.");
      }
      if ([...adapter.shipments.values()]
        .some((candidate) => candidate.orderDocumentId === data.orderDocumentId)) {
        throw new Error("Duplicate shipment.");
      }
      adapter.sequence += 1;
      const shipment = {
        documentId: `shipment-${adapter.sequence}`,
        ...structuredClone(data),
      };
      adapter.shipments.set(shipment.documentId, shipment);
      return structuredClone(shipment);
    },
    async updateOrder(documentId, data) {
      if (failures.failUpdateOrder) {
        throw new Error("Simulated order update failure.");
      }
      const order = adapter.orders.get(documentId);
      if (!order) throw new Error("Order not found.");
      Object.assign(order, structuredClone(data));
      return structuredClone(order);
    },
    async lockShipment(documentId) {
      const shipment = adapter.shipments.get(documentId);
      return shipment ? structuredClone(shipment) : null;
    },
    async updateShipment(documentId, data) {
      const shipment = adapter.shipments.get(documentId);
      if (!shipment) throw new Error("Shipment not found.");
      Object.assign(shipment, structuredClone(data));
      return structuredClone(shipment);
    },
  };
}

function createStrapiShipmentAdapter(strapi) {
  const order = () => strapi.db.query("api::order.order");
  const payment = () => strapi.db.query("api::payment.payment");
  const product = () => strapi.db.query("api::product.product");
  const batch = () => strapi.db.query("api::inventory-batch.inventory-batch");
  const shipment = () => strapi.db.query("api::shipment.shipment");
  const compensation = () =>
    strapi.db.query("api::shipment-compensation.shipment-compensation");
  const options = (trx, extra = {}) => ({ ...extra, transacting: trx });
  return {
    findPendingCompensationsByOrder: (orderDocumentId) =>
      compensation().findMany({
        where: { orderDocumentId, status: "pending" },
        orderBy: { createdAt: "asc" },
        limit: 26,
      }),
    async recordCompensation(data) {
      const existing = await compensation().findOne({
        where: { compensationKey: data.compensationKey },
      });
      if (existing) {
        return compensation().update({
          where: { documentId: existing.documentId },
          data,
        });
      }
      try {
        return await compensation().create({ data });
      } catch (error) {
        const winner = await compensation().findOne({
          where: { compensationKey: data.compensationKey },
        });
        if (!winner) throw error;
        return compensation().update({
          where: { documentId: winner.documentId },
          data,
        });
      }
    },
    async markCompensationAttempt(documentId, attemptedAt) {
      const intent = await compensation().findOne({
        where: { documentId },
      });
      if (!intent || intent.status !== "pending") {
        throw new Error("Shipment compensation not found.");
      }
      return compensation().update({
        where: { documentId },
        data: {
          attempts: Number(intent.attempts) + 1,
          lastAttemptAt: attemptedAt,
        },
      });
    },
    async resolveCompensation(documentId, attemptedAt) {
      const intent = await compensation().findOne({
        where: { documentId },
      });
      if (!intent || intent.status !== "pending") {
        throw new Error("Shipment compensation not found.");
      }
      return compensation().update({
        where: { documentId },
        data: {
          attempts: Number(intent.attempts) + 1,
          lastAttemptAt: attemptedAt,
          status: "resolved",
          resolvedAt: attemptedAt,
        },
      });
    },
    logCompensationFailure({ orderDocumentId, provider, awb }) {
      strapi.log.error("Shipment compensation persistence failed.", {
        orderDocumentId,
        provider,
        ...(awb ? { awb } : {}),
      });
    },
    transaction: (work) => strapi.db.transaction(async ({ trx }) => work({
      findOrder: (documentId) => order().findOne(options(trx, {
        where: { documentId },
      })),
      async lockPayment(documentId) {
        await strapi.db.connection("payments")
          .where({ document_id: documentId })
          .transacting(trx)
          .forUpdate()
          .first();
        return payment().findOne(options(trx, { where: { documentId } }));
      },
      async lockOrder(documentId) {
        await strapi.db.connection("orders")
          .where({ document_id: documentId })
          .transacting(trx)
          .forUpdate()
          .first();
        return order().findOne(options(trx, { where: { documentId } }));
      },
      async lockPackingProducts(documentIds) {
        const locked = [];
        for (const documentId of documentIds) {
          const candidates = await product().findMany(options(trx, {
            where: {
              documentId,
              publishedAt: { $notNull: true },
            },
          }));
          if (candidates.length !== 1 ||
              !Number.isSafeInteger(candidates[0]?.id)) {
            continue;
          }
          await strapi.db.connection("products")
            .where({ id: candidates[0].id })
            .transacting(trx)
            .forUpdate()
            .first();
          const current = await product().findOne(options(trx, {
            where: {
              id: candidates[0].id,
              documentId,
              publishedAt: { $notNull: true },
            },
          }));
          if (current) locked.push(current);
        }
        return locked;
      },
      async lockPackingBatches(documentIds) {
        const locked = [];
        for (const documentId of documentIds) {
          await strapi.db.connection("inventory_batches")
            .where({ document_id: documentId })
            .transacting(trx)
            .forUpdate()
            .first();
          const current = await batch().findOne(options(trx, {
            where: { documentId },
          }));
          if (current) locked.push(current);
        }
        return locked;
      },
      findShipmentByOrder: (orderDocumentId) => shipment().findOne(options(trx, {
        where: { orderDocumentId },
      })),
      createShipment: (data) => shipment().create(options(trx, { data })),
      updateOrder: (documentId, data) => order().update(options(trx, {
        where: { documentId },
        data,
      })),
      async lockShipment(documentId) {
        await strapi.db.connection("shipments")
          .where({ document_id: documentId })
          .transacting(trx)
          .forUpdate()
          .first();
        return shipment().findOne(options(trx, { where: { documentId } }));
      },
      updateShipment: (documentId, data) => shipment().update(options(trx, {
        where: { documentId },
        data,
      })),
    })),
  };
}

module.exports = {
  LABEL_CONTENT_TYPES,
  createMemoryShipmentAdapter,
  createMockShippingProvider,
  createShipmentTransactions,
  createStrapiShipmentAdapter,
  safeShipment,
};
