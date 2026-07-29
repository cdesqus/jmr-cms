"use strict";

const {
  createHash,
  randomBytes: secureRandomBytes,
  timingSafeEqual,
} = require("node:crypto");

const {
  publicTrackingProjection,
} = require("../../shipping-operations/services/tracking-domain.cjs");

const PUBLIC_ORDER_FIELDS = Object.freeze([
  "documentId",
  "orderNumber",
  "trackingNumber",
  "carrier",
  "status",
  "estimatedDelivery",
  "createdAt",
  "updatedAt",
  "trackingCapabilityHash",
]);
const TRACKING_CAPABILITY = /^trk_[A-Za-z0-9_-]{43}$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function opaqueIp(value) {
  return createHash("sha256")
    .update(text(value).toLowerCase() || "<missing>")
    .digest("base64url");
}

function publicTrackingCapabilityDigest(value) {
  const access = text(value);
  if (!TRACKING_CAPABILITY.test(access)) {
    throw new TypeError("Tracking access capability is invalid.");
  }
  return createHash("sha256").update(access, "utf8").digest("hex");
}

function issuePublicTrackingCapability({
  storefrontUrl,
  orderNumber,
  randomBytes = secureRandomBytes,
}) {
  const normalizedOrderNumber = text(orderNumber);
  if (!normalizedOrderNumber || normalizedOrderNumber.length > 255) {
    throw new TypeError("Tracking order number is invalid.");
  }
  const entropy = randomBytes(32);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 32) {
    throw new TypeError("Tracking capability entropy is invalid.");
  }
  const access = `trk_${entropy.toString("base64url")}`;
  const preview = new URL("/track", text(storefrontUrl));
  preview.searchParams.set("order", normalizedOrderNumber);
  preview.searchParams.set("access", access);
  return {
    access,
    digest: publicTrackingCapabilityDigest(access),
    previewUrl: preview.toString(),
  };
}

function hasPublicTrackingCapability(order, value) {
  const expected = text(order?.trackingCapabilityHash).toLowerCase();
  let actual;
  try {
    actual = publicTrackingCapabilityDigest(value);
  } catch {
    actual = "0".repeat(64);
  }
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}

function createPublicOrderTrackingLimiter(options = {}) {
  const limit = positiveInteger(options.limit, 30);
  const windowMs = positiveInteger(options.windowMs, 60_000);
  const maxBuckets = positiveInteger(options.maxBuckets, 10_000);
  const now = options.now ?? Date.now;
  const buckets = new Map();
  return {
    check(ip) {
      const timestamp = now();
      const key = opaqueIp(ip);
      const current = buckets.get(key);
      if (!current || timestamp >= current.resetAt) {
        if (!current && buckets.size >= maxBuckets) {
          for (const [candidate, bucket] of buckets) {
            if (timestamp >= bucket.resetAt) buckets.delete(candidate);
          }
          while (buckets.size >= maxBuckets) {
            buckets.delete(buckets.keys().next().value);
          }
        }
        buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
        return { allowed: true };
      }
      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfter: Math.max(
            1,
            Math.ceil((current.resetAt - timestamp) / 1_000),
          ),
        };
      }
      current.count += 1;
      return { allowed: true };
    },
    bucketCount: () => buckets.size,
  };
}

function createPublicOrderTrackingPrivacyFloor(options = {}) {
  const minimumMs = positiveInteger(options.minimumMs, 150);
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((duration) =>
    new Promise((resolve) => setTimeout(resolve, duration)));
  return async function enforcePrivacyFloor(startedAt) {
    const remaining = Math.max(0, minimumMs - (now() - startedAt));
    if (remaining > 0) await wait(remaining);
  };
}

function minimalPublicOrder(order, shipment) {
  return {
    orderNumber: text(order.orderNumber),
    status: text(order.status).toLowerCase(),
    createdAt: order.createdAt,
    ...(order.estimatedDelivery
      ? { estimatedDelivery: order.estimatedDelivery }
      : {}),
    shipment,
  };
}

function createPublicOrderTrackingQuery({
  documents,
}) {
  if (typeof documents !== "function") {
    throw new TypeError("Document query factory is required.");
  }
  return async function findPublicTrackedOrder(value, access) {
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
    const order = orders[0];
    if (!order) return null;
    if (!hasPublicTrackingCapability(order, access)) return null;
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
    return minimalPublicOrder(order, projected);
  };
}

module.exports = {
  PUBLIC_ORDER_FIELDS,
  createPublicOrderTrackingLimiter,
  createPublicOrderTrackingPrivacyFloor,
  createPublicOrderTrackingQuery,
  issuePublicTrackingCapability,
  publicTrackingCapabilityDigest,
};
