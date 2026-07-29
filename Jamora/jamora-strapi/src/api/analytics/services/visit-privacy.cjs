"use strict";

const REDACTED = "[REDACTED]";
const SECRET_VALUE =
  /\b(?:trk_[A-Za-z0-9_-]{43}|rsv_[A-Za-z0-9_-]{20,}|mco_[A-Za-z0-9_-]{20,})\b/g;
const SECRET_PARAMETER =
  /^(?:access|token|capability|authorization|reservationToken|checkoutReference|api[-_]?key)$/i;

function boundedText(value, maximum) {
  return (typeof value === "string" ? value : "").slice(0, maximum);
}

function redactSecrets(value) {
  return String(value ?? "").replace(SECRET_VALUE, REDACTED);
}

function sanitizeAnalyticsLocation(value, maximum = 1_000) {
  const raw = boundedText(value, 8_192);
  if (!raw) return "";
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  try {
    const parsed = new URL(raw, "https://analytics.invalid");
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    parsed.pathname = redactSecrets(parsed.pathname);
    for (const [key, current] of [...parsed.searchParams.entries()]) {
      parsed.searchParams.set(
        key,
        SECRET_PARAMETER.test(key) ? REDACTED : redactSecrets(current),
      );
    }
    const safe = absolute
      ? `${parsed.origin}${parsed.pathname}${parsed.search}`
      : `${parsed.pathname}${parsed.search}`;
    return safe.slice(0, maximum);
  } catch {
    return redactSecrets(raw).slice(0, maximum);
  }
}

function sanitizeVisitPayload(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    visitorId: redactSecrets(boundedText(input.visitorId, 120)),
    path: sanitizeAnalyticsLocation(input.path || "/", 500) || "/",
    referrer: sanitizeAnalyticsLocation(input.referrer, 1_000),
    userAgent: redactSecrets(boundedText(input.userAgent, 1_000)),
  };
}

function createVisitPrivacyPurge(adapter) {
  return {
    async run(input = {}) {
      const cursor = boundedText(input.cursor, 255);
      const limit = Math.min(
        500,
        Math.max(1, Number.isSafeInteger(input.limit) ? input.limit : 100),
      );
      const visits = await adapter.findBatch({ cursor, limit });
      let updated = 0;
      const nextCursor = visits.length === limit
        ? visits.at(-1)?.documentId ?? null
        : null;
      const result = {
        scanned: visits.length,
        updated: 0,
        nextCursor,
        complete: visits.length < limit,
      };
      await adapter.transaction(async (tx) => {
        for (const visit of visits) {
          const safe = sanitizeVisitPayload(visit);
          if (safe.path === (visit.path ?? "") &&
              safe.referrer === (visit.referrer ?? "") &&
              safe.visitorId === (visit.visitorId ?? "") &&
              safe.userAgent === (visit.userAgent ?? "")) {
            continue;
          }
          await tx.updateVisit(visit.documentId, safe);
          updated += 1;
        }
        result.updated = updated;
        await tx.recordAudit({
          action: "analytics.visit-privacy-purge",
          entityType: "visit-event",
          actor: boundedText(input.actor, 255) || "Jamora Admin",
          role: "owner",
          details: result,
        });
      });
      return result;
    },
  };
}

function createMemoryVisitPrivacyAdapter(options = {}) {
  const state = {
    visits: new Map(
      (options.visits ?? []).map((visit) => [
        visit.documentId,
        structuredClone(visit),
      ]),
    ),
    audits: [],
  };
  return {
    state,
    async findBatch({ cursor, limit }) {
      return [...state.visits.values()]
        .filter((visit) => !cursor || visit.documentId > cursor)
        .sort((left, right) =>
          left.documentId.localeCompare(right.documentId))
        .slice(0, limit)
        .map((visit) => structuredClone(visit));
    },
    async transaction(work) {
      const snapshot = {
        visits: new Map([...state.visits.entries()].map(([key, value]) => [
          key,
          structuredClone(value),
        ])),
        audits: structuredClone(state.audits),
      };
      try {
        return await work({
          async updateVisit(documentId, data) {
            const current = state.visits.get(documentId);
            state.visits.set(documentId, { ...current, ...data });
          },
          async recordAudit(data) {
            state.audits.push(structuredClone(data));
          },
        });
      } catch (error) {
        state.visits = snapshot.visits;
        state.audits = snapshot.audits;
        throw error;
      }
    },
  };
}

function withTransaction(trx, value) {
  return trx ? { ...value, transacting: trx } : value;
}

function createStrapiVisitPrivacyAdapter(strapi) {
  const visitQuery = () => strapi.db.query("api::visit-event.visit-event");
  const auditQuery = () => strapi.db.query("api::audit-log.audit-log");
  return {
    async findBatch({ cursor, limit }) {
      return visitQuery().findMany({
        where: cursor ? { documentId: { $gt: cursor } } : {},
        orderBy: [{ documentId: "asc" }],
        limit,
      });
    },
    async transaction(work) {
      return strapi.db.transaction(async ({ trx }) => work({
        async updateVisit(documentId, data) {
          await visitQuery().update(withTransaction(trx, {
            where: { documentId },
            data,
          }));
        },
        async recordAudit(data) {
          await auditQuery().create(withTransaction(trx, { data }));
        },
      }));
    },
  };
}

module.exports = {
  createMemoryVisitPrivacyAdapter,
  createStrapiVisitPrivacyAdapter,
  createVisitPrivacyPurge,
  redactSecrets,
  sanitizeAnalyticsLocation,
  sanitizeVisitPayload,
};
