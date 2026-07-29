"use strict";

const {
  issuePublicTrackingCapability,
  publicTrackingCapabilityDigest,
} = require("../../analytics/services/public-order-tracking.cjs");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash) {
    throw new TypeError("HTTPS storefront URL is required.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function requiredActor(value) {
  const actor = text(value);
  if (!actor || actor.length > 255) {
    throw new TypeError("Tracking capability reissue actor is required.");
  }
  return actor;
}

function safeOrder(value) {
  return {
    documentId: text(value?.documentId),
    orderNumber: text(value?.orderNumber),
    email: text(value?.email).toLowerCase(),
    customerDocumentId: text(value?.customerDocumentId),
    trackingCapabilityHash: text(value?.trackingCapabilityHash),
  };
}

function auditData({
  action,
  actor,
  order,
  now,
  details,
}) {
  return {
    action,
    entityType: "order",
    ...(order?.documentId ? { entityId: order.documentId } : {}),
    ...(order?.orderNumber ? { entityLabel: order.orderNumber } : {}),
    actor,
    role: "owner",
    details: {
      ...details,
      occurredAt: now.toISOString(),
    },
  };
}

async function reissueLegacyTrackingCapabilities({
  adapter,
  actor: actorInput,
  limit: requestedLimit,
  storefrontUrl: storefrontUrlInput,
  randomBytes,
  now: nowInput = new Date(),
}) {
  if (!adapter?.listMissingCapabilities ||
      !adapter?.transaction ||
      !adapter?.countMissingCapabilities ||
      !adapter?.createAudit) {
    throw new TypeError("Tracking capability reissue adapter is required.");
  }
  const actor = requiredActor(actorInput);
  const limit = trackingCapabilityReissueLimit(requestedLimit);
  const storefrontUrl = trustedStorefrontUrl(storefrontUrlInput);
  const now = nowInput instanceof Date ? new Date(nowInput) : new Date(nowInput);
  if (!Number.isFinite(now.getTime())) {
    throw new TypeError("Tracking capability reissue time is invalid.");
  }
  const selected = await adapter.listMissingCapabilities(limit);
  if (!Array.isArray(selected) || selected.length > limit) {
    throw new Error("Tracking capability reissue selection is not bounded.");
  }

  const summary = {
    selected: selected.length,
    reissued: 0,
    skippedIneligible: 0,
    skippedConcurrent: 0,
    remainingMissing: 0,
  };
  for (const candidate of selected) {
    const outcome = await adapter.transaction(async (tx) => {
      const order = safeOrder(await tx.lockMissingOrder(
        safeOrder(candidate).documentId,
      ));
      if (!order.documentId || !order.orderNumber ||
          order.trackingCapabilityHash) {
        if (order.documentId) {
          await tx.createAudit(auditData({
            action: "shipping.tracking-capability.skipped",
            actor,
            order,
            now,
            details: { outcome: "concurrent" },
          }));
        }
        return "concurrent";
      }
      const customer = await tx.findVerifiedCustomerForOrder(order);
      const eligible =
        customer?.active === true &&
        Boolean(customer?.emailVerifiedAt) &&
        text(customer?.documentId) === order.customerDocumentId &&
        text(customer?.email).toLowerCase() === order.email;
      if (!eligible) {
        await tx.createAudit(auditData({
          action: "shipping.tracking-capability.skipped",
          actor,
          order,
          now,
          details: { outcome: "ineligible" },
        }));
        return "ineligible";
      }

      const issued = issuePublicTrackingCapability({
        storefrontUrl,
        orderNumber: order.orderNumber,
        ...(randomBytes ? { randomBytes } : {}),
      });
      const updated = await tx.storeCapabilityIfMissing(order.documentId, {
        trackingCapabilityHash: issued.digest,
        trackingPreviewUrl: issued.previewUrl,
      });
      if (!updated) {
        await tx.createAudit(auditData({
          action: "shipping.tracking-capability.skipped",
          actor,
          order,
          now,
          details: { outcome: "concurrent" },
        }));
        return "concurrent";
      }
      await tx.createAudit(auditData({
        action: "shipping.tracking-capability.reissued",
        actor,
        order,
        now,
        details: {
          outcome: "reissued",
          delivery: "verified_customer_account",
        },
      }));
      return "reissued";
    });
    if (outcome === "reissued") summary.reissued += 1;
    else if (outcome === "ineligible") summary.skippedIneligible += 1;
    else summary.skippedConcurrent += 1;
  }
  summary.remainingMissing = await adapter.countMissingCapabilities();
  await adapter.createAudit(auditData({
    action: "shipping.tracking-capability.batch",
    actor,
    now,
    details: {
      outcome: "completed",
      ...summary,
    },
  }));
  return summary;
}

async function listCustomerTrackingLinks({
  adapter,
  customerDocumentId: customerDocumentIdInput,
  storefrontUrl: storefrontUrlInput,
}) {
  if (!adapter?.listCustomerLinks) {
    throw new TypeError("Tracking capability reissue adapter is required.");
  }
  const customerDocumentId = text(customerDocumentIdInput);
  if (!customerDocumentId || customerDocumentId.length > 255) {
    throw new TypeError("Customer document ID is required.");
  }
  const storefrontUrl = trustedStorefrontUrl(storefrontUrlInput);
  const origin = new URL(storefrontUrl).origin;
  const orders = await adapter.listCustomerLinks(customerDocumentId, 100);
  if (!Array.isArray(orders) || orders.length > 100) {
    throw new Error("Customer tracking link result is not bounded.");
  }
  const links = [];
  for (const order of orders) {
    const orderNumber = text(order?.orderNumber);
    const expectedDigest = text(order?.trackingCapabilityHash).toLowerCase();
    let preview;
    try {
      preview = new URL(text(order?.trackingPreviewUrl));
    } catch {
      continue;
    }
    const access = preview.searchParams.get("access");
    const parameters = [...preview.searchParams.keys()].sort();
    let actualDigest;
    try {
      actualDigest = publicTrackingCapabilityDigest(access);
    } catch {
      continue;
    }
    if (!orderNumber ||
        preview.origin !== origin ||
        preview.pathname !== "/track" ||
        parameters.length !== 2 ||
        parameters[0] !== "access" ||
        parameters[1] !== "order" ||
        preview.searchParams.get("order") !== orderNumber ||
        actualDigest !== expectedDigest) {
      continue;
    }
    links.push({
      orderNumber,
      trackingUrl: preview.toString(),
    });
  }
  return links;
}

function createMemoryTrackingCapabilityAdapter({
  orders = [],
  customers = [],
  audits = [],
  beforeConditionalUpdate,
} = {}) {
  const adapter = {
    orders: new Map(orders.map((order) => [
      order.documentId,
      structuredClone(order),
    ])),
    customers: new Map(customers.map((customer) => [
      customer.documentId,
      structuredClone(customer),
    ])),
    audits: structuredClone(audits),
    queue: Promise.resolve(),
    async listMissingCapabilities(limit) {
      return [...adapter.orders.values()]
        .filter((order) => !text(order.trackingCapabilityHash))
        .slice(0, limit)
        .map((order) => structuredClone(order));
    },
    async countMissingCapabilities() {
      return [...adapter.orders.values()]
        .filter((order) => !text(order.trackingCapabilityHash))
        .length;
    },
    async listCustomerLinks(customerDocumentId, limit) {
      return [...adapter.orders.values()]
        .filter((order) =>
          order.customerDocumentId === customerDocumentId &&
          text(order.trackingCapabilityHash))
        .slice(0, limit)
        .map((order) => structuredClone(order));
    },
    async createAudit(data) {
      adapter.audits.push(structuredClone(data));
    },
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const orderSnapshot = structuredClone([...adapter.orders]);
      const auditSnapshot = structuredClone(adapter.audits);
      try {
        return await work({
          async lockMissingOrder(documentId) {
            const order = adapter.orders.get(documentId);
            return order ? structuredClone(order) : null;
          },
          async findVerifiedCustomerForOrder(order) {
            const customer = adapter.customers.get(order.customerDocumentId);
            return customer ? structuredClone(customer) : null;
          },
          async storeCapabilityIfMissing(documentId, data) {
            const order = adapter.orders.get(documentId);
            if (!order) return false;
            beforeConditionalUpdate?.(order);
            if (text(order.trackingCapabilityHash)) return false;
            Object.assign(order, structuredClone(data));
            return true;
          },
          async createAudit(data) {
            adapter.audits.push(structuredClone(data));
          },
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
  const withTransaction = (trx, value) => ({
    ...value,
    transacting: trx,
  });
  return {
    listMissingCapabilities: (limit) => orderQuery().findMany({
      where: { trackingCapabilityHash: { $null: true } },
      orderBy: [{ createdAt: "asc" }],
      limit,
    }),
    countMissingCapabilities: async () => orderQuery().count({
      where: { trackingCapabilityHash: { $null: true } },
    }),
    listCustomerLinks: (customerDocumentId, limit) => orderQuery().findMany({
      where: {
        customerDocumentId,
        trackingCapabilityHash: { $notNull: true },
      },
      orderBy: [{ createdAt: "desc" }],
      limit,
    }),
    createAudit: (data) => auditQuery().create({ data }),
    transaction: (work) => strapi.db.transaction(async ({ trx }) => work({
      async lockMissingOrder(documentId) {
        const candidate = await orderQuery().findOne(withTransaction(trx, {
          where: { documentId },
        }));
        if (!candidate?.id) return null;
        await strapi.db.connection("orders")
          .where({ id: candidate.id })
          .transacting(trx)
          .forUpdate()
          .first();
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
      async storeCapabilityIfMissing(documentId, data) {
        const result = await orderQuery().updateMany(withTransaction(trx, {
          where: {
            documentId,
            trackingCapabilityHash: { $null: true },
          },
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
  createMemoryTrackingCapabilityAdapter,
  createStrapiTrackingCapabilityAdapter,
  listCustomerTrackingLinks,
  reissueLegacyTrackingCapabilities,
  trackingCapabilityReissueLimit,
  trustedStorefrontUrl,
};
