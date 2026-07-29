"use strict";

const {
  issuePublicTrackingCapability,
} = require("../../analytics/services/public-order-tracking.cjs");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ACTIONS = new Set(["rotate", "revoke"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function trackingCapabilityReissueLimit(value = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new TypeError("Tracking capability reissue limit is invalid.");
  }
  return parsed;
}

function trustedStorefrontUrl(value) {
  let parsed;
  try {
    parsed = new URL(text(value));
  } catch {
    throw new TypeError("HTTPS storefront URL is required.");
  }
  const localDevelopment =
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !localDevelopment) ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError("HTTPS storefront URL is required.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function required(value, label) {
  const result = text(value);
  if (!result || result.length > 255) {
    throw new TypeError(`${label} is required.`);
  }
  return result;
}

function validNow(value) {
  const result = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(result.getTime())) {
    throw new TypeError("Tracking capability time is invalid.");
  }
  return result;
}

function safeOrder(value) {
  return {
    documentId: text(value?.documentId),
    orderNumber: text(value?.orderNumber),
    email: text(value?.email).toLowerCase(),
    customerDocumentId: text(value?.customerDocumentId),
    trackingCapabilityHash: text(value?.trackingCapabilityHash),
    trackingCapabilityStatus: text(value?.trackingCapabilityStatus),
    trackingCapabilityVersion:
      Number.isSafeInteger(value?.trackingCapabilityVersion)
        ? value.trackingCapabilityVersion
        : 0,
  };
}

function auditData({ action, actor, role = "owner", order, now, details }) {
  return {
    action,
    entityType: "order",
    ...(order?.documentId ? { entityId: order.documentId } : {}),
    ...(order?.orderNumber ? { entityLabel: order.orderNumber } : {}),
    actor,
    role,
    details: { ...details, occurredAt: now.toISOString() },
  };
}

function verifiedBinding(order, customer) {
  return customer?.active === true &&
    Boolean(customer?.emailVerifiedAt) &&
    text(customer?.documentId) === order.customerDocumentId &&
    text(customer?.email).toLowerCase() === order.email;
}

async function reissueLegacyTrackingCapabilities({
  adapter,
  actor: actorInput,
  limit: requestedLimit,
  storefrontUrl: storefrontUrlInput,
  now: nowInput = new Date(),
}) {
  if (!adapter?.listUnreviewedCapabilities || !adapter?.transaction ||
      !adapter?.countUnreviewedCapabilities || !adapter?.createAudit) {
    throw new TypeError("Tracking capability reissue adapter is required.");
  }
  const actor = required(actorInput, "Tracking capability reissue actor");
  const limit = trackingCapabilityReissueLimit(requestedLimit);
  // Validate configuration now even though no raw capability is created by the job.
  trustedStorefrontUrl(storefrontUrlInput);
  const now = validNow(nowInput);
  const selected = await adapter.listUnreviewedCapabilities(limit);
  if (!Array.isArray(selected) || selected.length > limit) {
    throw new Error("Tracking capability reissue selection is not bounded.");
  }
  const summary = {
    selected: selected.length,
    queued: 0,
    skippedIneligible: 0,
    skippedConcurrent: 0,
    remainingUnreviewed: 0,
  };
  for (const candidate of selected) {
    const outcome = await adapter.transaction(async (tx) => {
      const order = safeOrder(await tx.lockOrder(safeOrder(candidate).documentId));
      if (!order.documentId || order.trackingCapabilityHash ||
          order.trackingCapabilityStatus) {
        return "concurrent";
      }
      const customer = await tx.findVerifiedCustomerForOrder(order);
      const status = verifiedBinding(order, customer)
        ? "pending_delivery"
        : "ineligible";
      const updated = await tx.markReviewedIfUnchanged(order.documentId, {
        trackingPreviewUrl: null,
        trackingCapabilityStatus: status,
        trackingCapabilityReviewedAt: now.toISOString(),
      });
      if (!updated) return "concurrent";
      await tx.createAudit(auditData({
        action: status === "pending_delivery"
          ? "shipping.tracking-capability.queued"
          : "shipping.tracking-capability.skipped",
        actor,
        order,
        now,
        details: {
          outcome: status === "pending_delivery" ? "queued" : "ineligible",
          delivery: status === "pending_delivery"
            ? "verified_customer_one_time_claim"
            : "none",
        },
      }));
      return status === "pending_delivery" ? "queued" : "ineligible";
    });
    if (outcome === "queued") summary.queued += 1;
    else if (outcome === "ineligible") summary.skippedIneligible += 1;
    else summary.skippedConcurrent += 1;
  }
  summary.remainingUnreviewed = await adapter.countUnreviewedCapabilities();
  await adapter.createAudit(auditData({
    action: "shipping.tracking-capability.batch",
    actor,
    now,
    details: { outcome: "completed", ...summary },
  }));
  return summary;
}

async function claimCustomerTrackingCapability({
  adapter,
  customerDocumentId: customerInput,
  orderDocumentId: orderInput,
  storefrontUrl: storefrontInput,
  randomBytes,
  now: nowInput = new Date(),
}) {
  if (!adapter?.transaction) {
    throw new TypeError("Tracking capability adapter is required.");
  }
  const customerDocumentId = required(customerInput, "Customer document ID");
  const orderDocumentId = required(orderInput, "Order document ID");
  const storefrontUrl = trustedStorefrontUrl(storefrontInput);
  const now = validNow(nowInput);
  return adapter.transaction(async (tx) => {
    const order = safeOrder(await tx.lockOrder(orderDocumentId));
    const customer = await tx.findVerifiedCustomerForOrder(order);
    if (!order.documentId || order.customerDocumentId !== customerDocumentId ||
        !verifiedBinding(order, customer) ||
        order.trackingCapabilityStatus !== "pending_delivery" ||
        order.trackingCapabilityHash) {
      throw new Error("Tracking capability is not available.");
    }
    const issued = issuePublicTrackingCapability({
      storefrontUrl,
      orderNumber: order.orderNumber,
      ...(randomBytes ? { randomBytes } : {}),
    });
    const updated = await tx.activateClaimIfUnchanged(
      order.documentId,
      order.trackingCapabilityVersion,
      {
        trackingPreviewUrl: null,
        trackingCapabilityHash: issued.digest,
        trackingCapabilityStatus: "active",
        trackingCapabilityReviewedAt: now.toISOString(),
      },
    );
    if (!updated) throw new Error("Tracking capability is not available.");
    await tx.createAudit(auditData({
      action: "shipping.tracking-capability.claimed",
      actor: customerDocumentId,
      role: "customer",
      order,
      now,
      details: { outcome: "claimed", delivery: "authenticated_response_once" },
    }));
    return { orderNumber: order.orderNumber, trackingUrl: issued.previewUrl };
  });
}

function managedIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LIMIT ||
      value.some((item) => !/^[A-Za-z0-9_-]{1,255}$/.test(text(item))) ||
      new Set(value.map(text)).size !== value.length) {
    throw new TypeError("Tracking capability order document IDs are invalid.");
  }
  return value.map(text);
}

async function manageTrackingCapabilities({
  adapter,
  actor: actorInput,
  action: actionInput,
  orderDocumentIds: idsInput,
  now: nowInput = new Date(),
}) {
  if (!adapter?.transaction || !adapter?.createAudit) {
    throw new TypeError("Tracking capability adapter is required.");
  }
  const actor = required(actorInput, "Tracking capability actor");
  const action = text(actionInput);
  if (!ACTIONS.has(action)) {
    throw new TypeError("Tracking capability action is invalid.");
  }
  const orderDocumentIds = managedIds(idsInput);
  const now = validNow(nowInput);
  const summary = {
    selected: orderDocumentIds.length,
    updated: 0,
    skippedConcurrent: 0,
  };
  for (const documentId of orderDocumentIds) {
    const outcome = await adapter.transaction(async (tx) => {
      const order = safeOrder(await tx.lockOrder(documentId));
      if (!order.documentId) {
        await tx.createAudit(auditData({
          action: "shipping.tracking-capability.management-skipped",
          actor,
          order: safeOrder({ documentId }),
          now,
          details: { action, outcome: "not_found" },
        }));
        return "concurrent";
      }
      const next = {
        trackingPreviewUrl: null,
        trackingCapabilityHash: null,
        trackingCapabilityStatus:
          action === "rotate" ? "pending_delivery" : "revoked",
        trackingCapabilityVersion: order.trackingCapabilityVersion + 1,
        trackingCapabilityReviewedAt: now.toISOString(),
      };
      const updated = await tx.manageIfVersion(
        documentId,
        order.trackingCapabilityVersion,
        next,
      );
      if (!updated) {
        await tx.createAudit(auditData({
          action: "shipping.tracking-capability.management-skipped",
          actor,
          order,
          now,
          details: { action, outcome: "version_raced" },
        }));
        return "concurrent";
      }
      await tx.createAudit(auditData({
        action: `shipping.tracking-capability.${action}d`,
        actor,
        order,
        now,
        details: {
          action,
          outcome: `${action}d`,
          fromVersion: order.trackingCapabilityVersion,
          toVersion: next.trackingCapabilityVersion,
        },
      }));
      return "updated";
    });
    if (outcome === "updated") summary.updated += 1;
    else summary.skippedConcurrent += 1;
  }
  await adapter.createAudit(auditData({
    action: "shipping.tracking-capability.management-batch",
    actor,
    now,
    details: { action, outcome: "completed", ...summary },
  }));
  return summary;
}

function createMemoryTrackingCapabilityAdapter({
  orders = [], customers = [], audits = [], beforeConditionalUpdate,
} = {}) {
  const adapter = {
    orders: new Map(orders.map((order) => [order.documentId, structuredClone(order)])),
    customers: new Map(customers.map((customer) => [
      customer.documentId, structuredClone(customer),
    ])),
    audits: structuredClone(audits),
    queue: Promise.resolve(),
    async listUnreviewedCapabilities(limit) {
      return [...adapter.orders.values()]
        .filter((order) => !text(order.trackingCapabilityHash) &&
          !text(order.trackingCapabilityStatus))
        .slice(0, limit)
        .map((order) => structuredClone(order));
    },
    async countUnreviewedCapabilities() {
      return [...adapter.orders.values()].filter((order) =>
        !text(order.trackingCapabilityHash) &&
        !text(order.trackingCapabilityStatus)).length;
    },
    async createAudit(data) { adapter.audits.push(structuredClone(data)); },
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const orderSnapshot = structuredClone([...adapter.orders]);
      const auditSnapshot = structuredClone(adapter.audits);
      try {
        return await work({
          async lockOrder(documentId) {
            const order = adapter.orders.get(documentId);
            return order ? structuredClone(order) : null;
          },
          async findVerifiedCustomerForOrder(order) {
            const customer = adapter.customers.get(order.customerDocumentId);
            return customer ? structuredClone(customer) : null;
          },
          async markReviewedIfUnchanged(documentId, data) {
            const order = adapter.orders.get(documentId);
            beforeConditionalUpdate?.(order);
            if (!order || text(order.trackingCapabilityHash) ||
                text(order.trackingCapabilityStatus)) return false;
            Object.assign(order, structuredClone(data));
            return true;
          },
          async activateClaimIfUnchanged(documentId, version, data) {
            const order = adapter.orders.get(documentId);
            beforeConditionalUpdate?.(order);
            if (!order || text(order.trackingCapabilityHash) ||
                order.trackingCapabilityStatus !== "pending_delivery" ||
                (order.trackingCapabilityVersion ?? 0) !== version) return false;
            Object.assign(order, structuredClone(data));
            return true;
          },
          async manageIfVersion(documentId, version, data) {
            const order = adapter.orders.get(documentId);
            beforeConditionalUpdate?.(order);
            if (!order || (order.trackingCapabilityVersion ?? 0) !== version) {
              return false;
            }
            Object.assign(order, structuredClone(data));
            return true;
          },
          async createAudit(data) { adapter.audits.push(structuredClone(data)); },
        });
      } catch (error) {
        adapter.orders = new Map(orderSnapshot);
        adapter.audits = auditSnapshot;
        throw error;
      } finally {
        release();
      }
    },
  };
  return adapter;
}

function createStrapiTrackingCapabilityAdapter(strapi) {
  const orderQuery = () => strapi.db.query("api::order.order");
  const customerQuery = () =>
    strapi.db.query("api::customer-account.customer-account");
  const auditQuery = () => strapi.db.query("api::audit-log.audit-log");
  const withTransaction = (trx, value) => ({ ...value, transacting: trx });
  return {
    listUnreviewedCapabilities: (limit) => orderQuery().findMany({
      where: {
        trackingCapabilityHash: { $null: true },
        trackingCapabilityStatus: { $null: true },
      },
      orderBy: [{ createdAt: "asc" }],
      limit,
    }),
    countUnreviewedCapabilities: () => orderQuery().count({
      where: {
        trackingCapabilityHash: { $null: true },
        trackingCapabilityStatus: { $null: true },
      },
    }),
    createAudit: (data) => auditQuery().create({ data }),
    transaction: (work) => strapi.db.transaction(async ({ trx }) => work({
      async lockOrder(documentId) {
        const candidate = await orderQuery().findOne(withTransaction(trx, {
          where: { documentId },
        }));
        if (!candidate?.id) return null;
        await strapi.db.connection("orders").where({ id: candidate.id })
          .transacting(trx).forUpdate().first();
        return orderQuery().findOne(withTransaction(trx, {
          where: { id: candidate.id },
        }));
      },
      findVerifiedCustomerForOrder(order) {
        if (!order.customerDocumentId) return null;
        return customerQuery().findOne(withTransaction(trx, {
          where: {
            documentId: order.customerDocumentId,
            email: order.email,
            active: true,
            emailVerifiedAt: { $notNull: true },
          },
        }));
      },
      async markReviewedIfUnchanged(documentId, data) {
        const result = await orderQuery().updateMany(withTransaction(trx, {
          where: {
            documentId,
            trackingCapabilityHash: { $null: true },
            trackingCapabilityStatus: { $null: true },
          },
          data,
        }));
        return result?.count === 1;
      },
      async activateClaimIfUnchanged(documentId, version, data) {
        const result = await orderQuery().updateMany(withTransaction(trx, {
          where: {
            documentId,
            trackingCapabilityHash: { $null: true },
            trackingCapabilityStatus: "pending_delivery",
            trackingCapabilityVersion: version,
          },
          data,
        }));
        return result?.count === 1;
      },
      async manageIfVersion(documentId, version, data) {
        const result = await orderQuery().updateMany(withTransaction(trx, {
          where: { documentId, trackingCapabilityVersion: version },
          data,
        }));
        return result?.count === 1;
      },
      createAudit: (data) =>
        auditQuery().create(withTransaction(trx, { data })),
    })),
  };
}

module.exports = {
  claimCustomerTrackingCapability,
  createMemoryTrackingCapabilityAdapter,
  createStrapiTrackingCapabilityAdapter,
  manageTrackingCapabilities,
  reissueLegacyTrackingCapabilities,
  trackingCapabilityReissueLimit,
  trustedStorefrontUrl,
};
