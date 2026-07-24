"use strict";

const { randomUUID } = require("node:crypto");

const iso = (value = new Date()) => (value instanceof Date ? value : new Date(value)).toISOString();
const coherent = (entry, membership) => ({ entry, membership, idempotent: true });

function addMonths(date, months) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + Number(months));
  return result;
}

function createMembershipTransactions(adapter) {
  async function execute(idempotencyKey, work) {
    if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) throw new TypeError("idempotencyKey is required.");
    const existing = await adapter.findEntry(idempotencyKey);
    if (existing) return coherent(existing, await adapter.findMembership(existing.membershipDocumentId));
    try {
      return await adapter.transaction(async (tx) => {
        const raced = await tx.findEntry(idempotencyKey);
        if (raced) return coherent(raced, await tx.findMembership(raced.membershipDocumentId));
        return work(tx);
      });
    } catch (error) {
      const raced = await adapter.findEntry(idempotencyKey);
      if (raced) return coherent(raced, await adapter.findMembership(raced.membershipDocumentId));
      throw error;
    }
  }

  return {
    reserveCredits(input) {
      return execute(input.idempotencyKey, async (tx) => {
        const membership = await tx.claimCredits(input.membershipId, input.credits, input.now ?? new Date());
        const entry = await tx.createEntry(entryData(input, "reserve", input.credits, "customer"));
        return { entry, membership, idempotent: false };
      });
    },
    releaseCredits(input) {
      return execute(input.idempotencyKey, async (tx) => {
        const reservation = await tx.findReservation(input.membershipId, input.checkoutReference);
        if (!reservation) throw new Error("Reservation not found.");
        const membership = await tx.changeBalance(input.membershipId, reservation.credits);
        const entry = await tx.createEntry(entryData(input, "release", reservation.credits, "customer"));
        return { entry, membership, idempotent: false };
      });
    },
    redeemCredits(input) {
      return execute(input.idempotencyKey, async (tx) => {
        const reservation = await tx.findReservation(input.membershipId, input.checkoutReference);
        if (!reservation) throw new Error("Reservation not found.");
        const membership = await tx.findMembership(input.membershipId);
        const entry = await tx.createEntry({ ...entryData(input, "redeem", reservation.credits, "customer"), orderDocumentId: input.orderId });
        return { entry, membership, idempotent: false };
      });
    },
    expireMembership(input) {
      return execute(input.idempotencyKey, async (tx) => {
        const current = await tx.findMembership(input.membershipId);
        if (!current) throw new Error("Membership not found.");
        if (new Date(current.endsAt) > new Date(input.now)) throw new Error("Membership is not due for expiry.");
        const credits = current.cachedRemainingCredits;
        const membership = await tx.expire(input.membershipId);
        const entry = await tx.createEntry(entryData(input, "expire", credits, "system"));
        return { entry, membership, idempotent: false };
      });
    },
    adjustCredits(input) {
      if (typeof input.reason !== "string" || !input.reason.trim()) return Promise.reject(new TypeError("reason is required for admin_adjustment."));
      if (!Number.isSafeInteger(input.creditDelta)) return Promise.reject(new TypeError("creditDelta must be a signed safe integer."));
      return execute(input.idempotencyKey, async (tx) => {
        const membership = await tx.changeBalance(input.membershipId, input.creditDelta);
        const entry = await tx.createEntry({
          ...entryData(input, "admin_adjustment", 0, input.actor),
          credits: undefined,
          creditDelta: input.creditDelta,
          reason: input.reason.trim(),
        });
        return { entry, membership, idempotent: false };
      });
    },
    activateMembership(input) {
      return execute(input.idempotencyKey, async (tx) => {
        const current = await tx.findMembership(input.membershipId);
        if (!current || current.status !== "pending_payment") throw new Error("Membership must be pending payment.");
        const startsAt = new Date(input.now);
        const credits = current.planSnapshot.packageCredits;
        const membership = await tx.activate(input.membershipId, {
          paymentDocumentId: input.paymentDocumentId,
          startsAt: iso(startsAt),
          endsAt: iso(addMonths(startsAt, current.planSnapshot.durationMonths)),
          credits,
        });
        const entry = await tx.createEntry(entryData(input, "grant", credits, "payment"));
        return { entry, membership, idempotent: false };
      });
    },
  };
}

function entryData(input, kind, credits, actor) {
  return {
    entryId: randomUUID(),
    idempotencyKey: input.idempotencyKey,
    membershipDocumentId: input.membershipId,
    kind,
    credits,
    checkoutReference: input.checkoutReference,
    actor,
    occurredAt: iso(input.now),
  };
}

function createMemoryMembershipAdapter({ memberships = [], entries = [], failCreate = false } = {}) {
  const adapter = {
    memberships: new Map(memberships.map((item) => [item.documentId, structuredClone(item)])),
    entries: structuredClone(entries),
    queue: Promise.resolve(),
    findEntry: async (key) => adapter.entries.find((entry) => entry.idempotencyKey === key),
    findMembership: async (id) => adapter.memberships.get(id),
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const membershipSnapshot = structuredClone([...adapter.memberships]);
      const entrySnapshot = structuredClone(adapter.entries);
      const tx = memoryTx(adapter, failCreate);
      try {
        return await work(tx);
      } catch (error) {
        adapter.memberships = new Map(membershipSnapshot);
        adapter.entries.splice(0, adapter.entries.length, ...entrySnapshot);
        throw error;
      } finally {
        release();
      }
    },
  };
  return adapter;
}

function memoryTx(adapter, failCreate) {
  const requireMembership = (id) => {
    const membership = adapter.memberships.get(id);
    if (!membership) throw new Error("Membership not found.");
    return membership;
  };
  return {
    findEntry: adapter.findEntry,
    findMembership: adapter.findMembership,
    findReservation: async (id, ref) => adapter.entries.find((e) => e.membershipDocumentId === id && e.checkoutReference === ref && e.kind === "reserve"),
    async claimCredits(id, credits, now) {
      const membership = requireMembership(id);
      if (!Number.isSafeInteger(credits) || credits < 1) throw new TypeError("credits must be a positive safe integer.");
      if (membership.status !== "active" || new Date(now) < new Date(membership.startsAt) || new Date(now) >= new Date(membership.endsAt)) throw new Error("Membership must be active.");
      if (membership.cachedRemainingCredits < credits) throw new Error("Insufficient membership balance.");
      membership.cachedRemainingCredits -= credits;
      return membership;
    },
    async changeBalance(id, delta) {
      const membership = requireMembership(id);
      if (!Number.isSafeInteger(delta) || membership.cachedRemainingCredits + delta < 0) throw new Error("Invalid membership balance.");
      membership.cachedRemainingCredits += delta;
      return membership;
    },
    async expire(id) {
      const membership = requireMembership(id);
      membership.status = "expired";
      membership.cachedRemainingCredits = 0;
      return membership;
    },
    async activate(id, values) {
      const membership = requireMembership(id);
      Object.assign(membership, { status: "active", startsAt: values.startsAt, endsAt: values.endsAt, paymentDocumentId: values.paymentDocumentId, cachedRemainingCredits: values.credits });
      return membership;
    },
    async createEntry(data) {
      if (failCreate) throw new Error("simulated create failure");
      if (adapter.entries.some((entry) => entry.idempotencyKey === data.idempotencyKey)) throw new Error("duplicate idempotency key");
      adapter.entries.push(data);
      return data;
    },
  };
}

function createStrapiMembershipAdapter(strapi) {
  const membership = () => strapi.db.query("api::membership.membership");
  const ledger = () => strapi.db.query("api::membership-credit-entry.membership-credit-entry");
  const queryOptions = (trx, extra = {}) => ({ ...extra, transacting: trx });
  const findMembership = (id, trx) => membership().findOne(queryOptions(trx, { where: { documentId: id } }));
  const findEntry = (key, trx) => ledger().findOne(queryOptions(trx, { where: { idempotencyKey: key } }));
  return {
    findEntry: (key) => findEntry(key),
    findMembership: (id) => findMembership(id),
    transaction: (work) => strapi.db.transaction(async ({ trx }) => {
      const tx = {
        findEntry: (key) => findEntry(key, trx),
        findMembership: (id) => findMembership(id, trx),
        findReservation: (id, ref) => ledger().findOne(queryOptions(trx, { where: { membershipDocumentId: id, checkoutReference: ref, kind: "reserve" } })),
        async claimCredits(id, credits, now) {
          if (!Number.isSafeInteger(credits) || credits < 1) throw new TypeError("credits must be a positive safe integer.");
          const result = await membership().updateMany(queryOptions(trx, {
            where: { documentId: id, status: "active", startsAt: { $lte: iso(now) }, endsAt: { $gt: iso(now) }, cachedRemainingCredits: { $gte: credits } },
            data: { cachedRemainingCredits: strapi.db.connection.raw("cached_remaining_credits - ?", [credits]) },
          }));
          if (Number(result?.count ?? result) !== 1) throw new Error("Insufficient membership balance or inactive membership.");
          return findMembership(id, trx);
        },
        async changeBalance(id, delta) {
          const result = await membership().updateMany(queryOptions(trx, {
            where: { documentId: id, cachedRemainingCredits: { $gte: Math.max(0, -delta) } },
            data: { cachedRemainingCredits: strapi.db.connection.raw("cached_remaining_credits + ?", [delta]) },
          }));
          if (Number(result?.count ?? result) !== 1) throw new Error("Invalid membership balance.");
          return findMembership(id, trx);
        },
        async expire(id) {
          await membership().update(queryOptions(trx, { where: { documentId: id }, data: { status: "expired", cachedRemainingCredits: 0 } }));
          return findMembership(id, trx);
        },
        async activate(id, values) {
          await membership().update(queryOptions(trx, { where: { documentId: id, status: "pending_payment" }, data: { status: "active", startsAt: values.startsAt, endsAt: values.endsAt, paymentDocumentId: values.paymentDocumentId, cachedRemainingCredits: values.credits } }));
          return findMembership(id, trx);
        },
        createEntry: (data) => ledger().create(queryOptions(trx, { data })),
      };
      return work(tx);
    }),
  };
}

module.exports = { createMembershipTransactions, createMemoryMembershipAdapter, createStrapiMembershipAdapter };
