"use strict";

const { randomUUID } = require("node:crypto");
const { assertMembershipCanReserve, ledgerBalance } = require("./membership-domain.cjs");

const iso = (value = new Date()) => (value instanceof Date ? value : new Date(value)).toISOString();

function addMonths(date, months) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + Number(months));
  return result;
}

function assertEnabled(env) {
  if (env.MEMBERSHIP_ENABLED !== "true") {
    const error = new Error("Not found.");
    error.code = "membership_disabled";
    throw error;
  }
}

function immutableMatch(entry, expected) {
  const fields = ["membershipDocumentId", "kind", "credits", "creditDelta", "checkoutReference", "orderDocumentId", "reason", "actor"];
  return fields.every((field) =>
    !Object.hasOwn(expected, field) ||
    (entry[field] ?? null) === (expected[field] ?? null));
}

function idempotentResult(entry, membership, expected) {
  if (!immutableMatch(entry, expected)) throw new Error("Idempotency key conflict.");
  return { entry, membership, idempotent: true };
}

function createMembershipTransactions(adapter, env = process.env) {
  async function execute(expected, work) {
    assertEnabled(env);
    if (typeof expected.idempotencyKey !== "string" || !expected.idempotencyKey.trim()) throw new TypeError("idempotencyKey is required.");
    const existing = await adapter.findEntry(expected.idempotencyKey);
    if (existing) return idempotentResult(existing, await adapter.findMembership(expected.membershipDocumentId), expected);
    try {
      return await adapter.transaction(async (tx) => {
        const raced = await tx.findEntry(expected.idempotencyKey);
        if (raced) return idempotentResult(raced, await tx.lockMembership(expected.membershipDocumentId), expected);
        return work(tx, expected);
      });
    } catch (error) {
      const raced = await adapter.findEntry(expected.idempotencyKey);
      if (raced) return idempotentResult(raced, await adapter.findMembership(expected.membershipDocumentId), expected);
      throw error;
    }
  }

  async function authoritative(tx, membershipId) {
    const membership = await tx.lockMembership(membershipId);
    if (!membership) throw new Error("Membership not found.");
    const entries = await tx.listEntries(membershipId);
    return { membership, entries, balance: ledgerBalance(entries) };
  }

  async function appendAndCache(tx, data, currentEntries) {
    const entry = await tx.createEntry(data);
    const balance = ledgerBalance([...currentEntries, entry]);
    const membership = await tx.setBalance(data.membershipDocumentId, balance);
    return { entry, membership, idempotent: false };
  }

  function ensureUnsettled(entries, checkoutReference) {
    if (entries.some((entry) =>
      entry.checkoutReference === checkoutReference &&
      (entry.kind === "release" || entry.kind === "redeem"))) {
      throw new Error("Reservation already settled.");
    }
  }

  return {
    async reserveCredits(input) {
      assertEnabled(env);
      const expected = entryData(input, "reserve", input.credits, "customer");
      return execute(expected, async (tx) => {
        const state = await authoritative(tx, input.membershipId);
        assertMembershipCanReserve(state.membership, state.balance, input.credits, input.now ?? new Date());
        return appendAndCache(tx, expected, state.entries);
      });
    },
    async releaseCredits(input) {
      assertEnabled(env);
      const expected = entryData(input, "release", undefined, "customer");
      return execute(expected, async (tx) => {
        const state = await authoritative(tx, input.membershipId);
        const reservation = state.entries.find((entry) => entry.checkoutReference === input.checkoutReference && entry.kind === "reserve");
        if (!reservation) throw new Error("Reservation not found.");
        expected.credits = reservation.credits;
        ensureUnsettled(state.entries, input.checkoutReference);
        return appendAndCache(tx, expected, state.entries);
      });
    },
    async redeemCredits(input) {
      assertEnabled(env);
      const expected = { ...entryData(input, "redeem", undefined, "customer"), orderDocumentId: input.orderId };
      return execute(expected, async (tx) => {
        const state = await authoritative(tx, input.membershipId);
        const reservation = state.entries.find((entry) => entry.checkoutReference === input.checkoutReference && entry.kind === "reserve");
        if (!reservation) throw new Error("Reservation not found.");
        expected.credits = reservation.credits;
        ensureUnsettled(state.entries, input.checkoutReference);
        return appendAndCache(tx, expected, state.entries);
      });
    },
    async expireMembership(input) {
      assertEnabled(env);
      const expected = entryData(input, "expire", undefined, "system");
      return execute(expected, async (tx) => {
        await tx.settleReservedCheckouts(input.membershipId, input.now);
        const state = await authoritative(tx, input.membershipId);
        if (new Date(state.membership.endsAt) > new Date(input.now)) throw new Error("Membership is not due for expiry.");
        expected.credits = state.balance;
        const result = await appendAndCache(tx, expected, state.entries);
        result.membership = await tx.expire(input.membershipId);
        return result;
      });
    },
    async adjustCredits(input) {
      assertEnabled(env);
      if (typeof input.reason !== "string" || !input.reason.trim()) throw new TypeError("reason is required for admin_adjustment.");
      if (!Number.isSafeInteger(input.creditDelta)) throw new TypeError("creditDelta must be a signed safe integer.");
      const expected = {
        ...entryData(input, "admin_adjustment", undefined, input.actor),
        creditDelta: input.creditDelta,
        reason: input.reason.trim(),
      };
      return execute(expected, async (tx) => {
        const state = await authoritative(tx, input.membershipId);
        if (state.balance + input.creditDelta < 0) {
          throw new Error("Admin adjustment would reduce authoritative balance below zero.");
        }
        return appendAndCache(tx, expected, state.entries);
      });
    },
    async activateMembership(input) {
      assertEnabled(env);
      const expected = entryData({ ...input, checkoutReference: input.paymentDocumentId }, "grant", undefined, "payment");
      return execute(expected, async (tx) => {
        const state = await authoritative(tx, input.membershipId);
        if (state.membership.status !== "pending_payment") throw new Error("Membership must be pending payment.");
        const startsAt = new Date(input.now);
        expected.credits = state.membership.planSnapshot.packageCredits;
        const entry = await tx.createEntry(expected);
        const membership = await tx.activate(input.membershipId, {
          paymentDocumentId: input.paymentDocumentId,
          startsAt: iso(startsAt),
          endsAt: iso(addMonths(startsAt, state.membership.planSnapshot.durationMonths)),
          credits: ledgerBalance([...state.entries, entry]),
        });
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
    ...(credits === undefined ? {} : { credits }),
    ...(input.checkoutReference ? { checkoutReference: input.checkoutReference } : {}),
    actor,
    occurredAt: iso(input.now),
  };
}

function createMemoryMembershipAdapter({
  memberships = [], entries = [], checkouts = [], stock = {}, failCreate = false,
} = {}) {
  const seededEntries = structuredClone(entries);
  for (const membership of memberships) {
    if (
      membership.status === "active" &&
      membership.cachedRemainingCredits > 0 &&
      !seededEntries.some((entry) => entry.membershipDocumentId === membership.documentId)
    ) {
      seededEntries.push({
        entryId: `fixture-grant:${membership.documentId}`,
        idempotencyKey: `fixture-grant:${membership.documentId}`,
        membershipDocumentId: membership.documentId,
        kind: "grant",
        credits: membership.cachedRemainingCredits,
        actor: "fixture",
        occurredAt: membership.startsAt,
      });
    }
  }
  const adapter = {
    memberships: new Map(memberships.map((item) => [item.documentId, structuredClone(item)])),
    entries: seededEntries,
    checkouts: new Map(checkouts.map((item) => [item.checkoutReference, structuredClone(item)])),
    stock: new Map(Object.entries(stock)),
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
      const checkoutSnapshot = structuredClone([...adapter.checkouts]);
      const stockSnapshot = structuredClone([...adapter.stock]);
      try {
        return await work(memoryTx(adapter, failCreate));
      } catch (error) {
        adapter.memberships = new Map(membershipSnapshot);
        adapter.entries.splice(0, adapter.entries.length, ...entrySnapshot);
        adapter.checkouts = new Map(checkoutSnapshot);
        adapter.stock = new Map(stockSnapshot);
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
    lockMembership: adapter.findMembership,
    listEntries: async (id) => adapter.entries.filter((entry) => entry.membershipDocumentId === id),
    async settleReservedCheckouts(id, now) {
      const checkouts = [...adapter.checkouts.values()]
        .filter((checkout) => checkout.membershipDocumentId === id && checkout.status === "reserved")
        .sort((left, right) => left.checkoutReference.localeCompare(right.checkoutReference));
      for (const checkout of checkouts) {
        const reservation = adapter.entries.find((entry) =>
          entry.membershipDocumentId === id &&
          entry.checkoutReference === checkout.checkoutReference &&
          entry.kind === "reserve");
        const settled = adapter.entries.some((entry) =>
          entry.checkoutReference === checkout.checkoutReference &&
          (entry.kind === "release" || entry.kind === "redeem"));
        if (!reservation || settled) throw new Error("Checkout reservation binding is invalid.");
        for (const item of checkout.items ?? []) {
          adapter.stock.set(item.productDocumentId, (adapter.stock.get(item.productDocumentId) ?? 0) + item.qty);
        }
        adapter.entries.push({
          entryId: `expiry-release:${checkout.checkoutReference}`,
          idempotencyKey: `checkout:${checkout.checkoutReference}:release`,
          membershipDocumentId: id,
          checkoutReference: checkout.checkoutReference,
          kind: "release",
          credits: reservation.credits,
          actor: "system",
          occurredAt: iso(now),
        });
        checkout.status = "expired";
      }
    },
    async setBalance(id, balance) {
      const membership = requireMembership(id);
      membership.cachedRemainingCredits = balance;
      return membership;
    },
    async expire(id) {
      const membership = requireMembership(id);
      membership.status = "expired";
      return membership;
    },
    async activate(id, values) {
      const membership = requireMembership(id);
      if (membership.status !== "pending_payment") throw new Error("Membership activation conflict.");
      Object.assign(membership, { status: "active", startsAt: values.startsAt, endsAt: values.endsAt, paymentDocumentId: values.paymentDocumentId, cachedRemainingCredits: values.credits });
      return membership;
    },
    async createEntry(data) {
      if (failCreate) throw new Error("simulated create failure");
      if (adapter.entries.some((entry) => entry.idempotencyKey === data.idempotencyKey)) throw new Error("duplicate idempotency key");
      adapter.entries.push(structuredClone(data));
      return data;
    },
  };
}

function createStrapiMembershipAdapter(strapi) {
  const membership = () => strapi.db.query("api::membership.membership");
  const ledger = () => strapi.db.query("api::membership-credit-entry.membership-credit-entry");
  const checkout = () => strapi.db.query("api::membership-checkout.membership-checkout");
  const queryOptions = (trx, extra = {}) => ({ ...extra, transacting: trx });
  const findMembership = (id, trx) => membership().findOne(queryOptions(trx, { where: { documentId: id } }));
  const findEntry = (key, trx) => ledger().findOne(queryOptions(trx, { where: { idempotencyKey: key } }));
  return {
    findEntry: (key) => findEntry(key),
    findMembership: (id) => findMembership(id),
    transaction: (work) => strapi.db.transaction(async ({ trx }) => {
      const lockMembership = async (id) => {
        await strapi.db.connection("memberships")
          .where({ document_id: id })
          .transacting(trx)
          .forUpdate()
          .first();
        return findMembership(id, trx);
      };
      return work({
        findEntry: (key) => findEntry(key, trx),
        lockMembership,
        listEntries: (id) => ledger().findMany(queryOptions(trx, {
          where: { membershipDocumentId: id },
          orderBy: { occurredAt: "asc" },
        })),
        async settleReservedCheckouts(id, now) {
          const reserved = await checkout().findMany(queryOptions(trx, {
            where: { membershipDocumentId: id, status: "reserved" },
            orderBy: { checkoutReference: "asc" },
          }));
          for (const candidate of reserved) {
            await strapi.db.connection("membership_checkouts")
              .where({ document_id: candidate.documentId })
              .transacting(trx)
              .forUpdate()
              .first();
            const current = await checkout().findOne(queryOptions(trx, {
              where: { documentId: candidate.documentId },
            }));
            if (!current || current.status !== "reserved") continue;
            const reservation = await ledger().findOne(queryOptions(trx, {
              where: {
                membershipDocumentId: id,
                checkoutReference: current.checkoutReference,
                kind: "reserve",
              },
            }));
            const settled = await ledger().findOne(queryOptions(trx, {
              where: {
                checkoutReference: current.checkoutReference,
                kind: { $in: ["release", "redeem"] },
              },
            }));
            if (!reservation || settled) throw new Error("Checkout reservation binding is invalid.");
            for (const item of current.items ?? []) {
              await strapi.db.connection("products")
                .where({ document_id: item.productDocumentId })
                .transacting(trx)
                .increment("stock", item.qty);
            }
            await ledger().create(queryOptions(trx, { data: {
              entryId: randomUUID(),
              idempotencyKey: `checkout:${current.checkoutReference}:release`,
              membershipDocumentId: id,
              checkoutReference: current.checkoutReference,
              kind: "release",
              credits: reservation.credits,
              actor: "system",
              occurredAt: iso(now),
            } }));
            await checkout().update(queryOptions(trx, {
              where: { documentId: current.documentId },
              data: { status: "expired" },
            }));
          }
        },
        async setBalance(id, balance) {
          await membership().update(queryOptions(trx, { where: { documentId: id }, data: { cachedRemainingCredits: balance } }));
          return findMembership(id, trx);
        },
        async expire(id) {
          const result = await membership().updateMany(queryOptions(trx, {
            where: { documentId: id, status: "active" },
            data: { status: "expired" },
          }));
          if (Number(result?.count ?? result) !== 1) throw new Error("Membership expiry conflict.");
          return findMembership(id, trx);
        },
        async activate(id, values) {
          const result = await membership().updateMany(queryOptions(trx, {
            where: { documentId: id, status: "pending_payment" },
            data: { status: "active", startsAt: values.startsAt, endsAt: values.endsAt, paymentDocumentId: values.paymentDocumentId, cachedRemainingCredits: values.credits },
          }));
          if (Number(result?.count ?? result) !== 1) throw new Error("Membership activation conflict.");
          return findMembership(id, trx);
        },
        createEntry: (data) => ledger().create(queryOptions(trx, { data })),
      });
    }),
  };
}

module.exports = { createMembershipTransactions, createMemoryMembershipAdapter, createStrapiMembershipAdapter };
