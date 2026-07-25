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

function assertPaidAndPacked(order, payment, providerCarrier) {
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
  const checklist = Array.isArray(order.fulfilmentChecklist)
    ? order.fulfilmentChecklist
    : [];
  const packed = Boolean(packedAtText) &&
    Number.isFinite(packedAt.getTime()) &&
    Boolean(text(order.packedBy)) &&
    checklist.length > 0 &&
    checklist.every((item) => {
      const qty = Number(item?.qty);
      const scannedQty = Number(item?.scannedQty);
      return item?.checked === true &&
        Number.isSafeInteger(qty) &&
        qty > 0 &&
        Number.isSafeInteger(scannedQty) &&
        scannedQty >= qty;
    });
  if (!packed) throw new Error("A completed packed order is required to create a shipment.");
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
  if (!adapter?.transaction) throw new TypeError("Shipment adapter is required.");
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

  return {
    async createShipment({ orderDocumentId, actor, now = new Date() }) {
      const orderId = assertDocumentId(orderDocumentId, "Order document ID");
      const createdBy = assertActor(actor);
      const createdAt = iso(now);
      let providerShipment;
      try {
        return await adapter.transaction(async (tx) => {
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
            await tx.updateOrder(
              order.documentId,
              shippedOrderPatch(order, existing, createdBy, createdAt),
            );
            return { idempotent: true, shipment: safeShipment(existing) };
          }
          assertPaidAndPacked(order, payment, carrier);
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
        });
      } catch (error) {
        if (providerShipment?.awb || providerShipment?.labelReference) {
          try {
            await provider.cancelShipment({
              ...(providerShipment.awb ? { awb: providerShipment.awb } : {}),
              ...(providerShipment.labelReference
                ? { labelReference: providerShipment.labelReference }
                : {}),
            });
          } catch {
            // Preserve the authoritative database error; provider cleanup can be retried operationally.
          }
        }
        throw error;
      }
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
  shipments = [],
  failCreateShipment = false,
  failUpdateOrder = false,
} = {}) {
  const adapter = {
    orders: new Map(orders.map((order) => [order.documentId, structuredClone(order)])),
    payments: new Map(payments.map((payment) => [
      payment.documentId,
      structuredClone(payment),
    ])),
    shipments: new Map(shipments.map((shipment) => [
      shipment.documentId,
      structuredClone(shipment),
    ])),
    queue: Promise.resolve(),
    sequence: shipments.length,
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const orderSnapshot = structuredClone([...adapter.orders]);
      const paymentSnapshot = structuredClone([...adapter.payments]);
      const shipmentSnapshot = structuredClone([...adapter.shipments]);
      const sequenceSnapshot = adapter.sequence;
      try {
        return await work(memoryTransaction(adapter, {
          failCreateShipment,
          failUpdateOrder,
        }));
      } catch (error) {
        adapter.orders = new Map(orderSnapshot);
        adapter.payments = new Map(paymentSnapshot);
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
  const shipment = () => strapi.db.query("api::shipment.shipment");
  const options = (trx, extra = {}) => ({ ...extra, transacting: trx });
  return {
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
