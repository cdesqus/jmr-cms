"use strict";

const crypto = require("node:crypto");
const {
  reservationExpiryForSelection,
} = require("./shipping-order-finalization.cjs");

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function withTransaction(trx, value) {
  return trx ? { ...value, transacting: trx } : value;
}

function canonicalItems(value) {
  const seen = new Set();
  const items = (Array.isArray(value) ? value : []).map((item) => {
    const slug = text(item?.slug);
    const qty = Number(item?.qty);
    if (!slug || !Number.isSafeInteger(qty) || qty <= 0 || seen.has(slug)) {
      throw new Error("Reservation items are invalid.");
    }
    seen.add(slug);
    return { slug, qty };
  }).sort((left, right) => left.slug.localeCompare(right.slug));
  if (items.length === 0 || items.length > 100) {
    throw new Error("Reservation items are invalid.");
  }
  return items;
}

function requestBinding(input, items) {
  return {
    items,
    email: text(input.email).toLowerCase().slice(0, 320),
    customerDocumentId: text(input.customerDocumentId).slice(0, 255) || null,
    shippingSelection: input.shippingSelection &&
      typeof input.shippingSelection === "object"
      ? input.shippingSelection
      : null,
  };
}

function same(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function assertReplay(reservation, binding) {
  if (!reservation || !same(reservation.requestBinding, binding)) {
    throw new Error("Reservation idempotency conflict.");
  }
  if (reservation.status !== "reserved") {
    throw new Error("Reservation attempt is no longer active.");
  }
  return { ...reservation, idempotent: true };
}

function validQuantity(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function planAllocations(items, inventory, now) {
  const products = new Map();
  for (const product of inventory.products ?? []) {
    if (!product?.documentId || !product?.slug || products.has(product.slug)) {
      throw new Error("Authoritative product binding is invalid.");
    }
    products.set(product.slug, product);
  }
  const batches = Array.isArray(inventory.batches)
    ? inventory.batches.map((batch) => ({ ...batch }))
    : [];
  const allocations = [];
  const batchUpdates = [];

  for (const item of items) {
    const product = products.get(item.slug);
    if (!product) {
      throw new Error(`Authoritative product ${item.slug} is unavailable.`);
    }
    if (!validQuantity(Number(product.stock))) {
      throw new Error("Authoritative product stock is invalid.");
    }
    const productBatches = batches.filter((batch) => batch.slug === item.slug);
    for (const batch of productBatches) {
      if (batch.status === "active" &&
          (batch.productDocumentId !== product.documentId ||
           batch.sku !== product.sku)) {
        throw new Error(`Inventory batch binding for ${item.slug} is invalid.`);
      }
      if (!validQuantity(Number(batch.quantity)) ||
          !validQuantity(Number(batch.reservedQuantity ?? 0)) ||
          Number(batch.reservedQuantity ?? 0) > Number(batch.quantity)) {
        throw new Error("Inventory batch quantity is invalid.");
      }
    }

    let remaining = item.qty;
    const usable = productBatches
      .filter((batch) =>
        batch.status === "active" &&
        (!batch.expiryDate || new Date(batch.expiryDate).getTime() >= now.getTime()))
      .sort((left, right) => {
        const expiryOrder = String(left.expiryDate ?? "9999")
          .localeCompare(String(right.expiryDate ?? "9999"));
        return expiryOrder ||
          String(left.documentId).localeCompare(String(right.documentId));
      });
    for (const batch of usable) {
      const before = Number(batch.reservedQuantity ?? 0);
      const take = Math.min(remaining, Number(batch.quantity) - before);
      if (take <= 0) continue;
      batch.reservedQuantity = before + take;
      allocations.push({
        productDocumentId: product.documentId,
        slug: product.slug,
        sku: product.sku,
        name: product.name,
        batchDocumentId: batch.documentId,
        batchNumber: batch.batchNumber,
        ...(batch.productionDate
          ? { productionDate: batch.productionDate }
          : {}),
        ...(batch.expiryDate ? { expiryDate: batch.expiryDate } : {}),
        qty: take,
      });
      batchUpdates.push({
        documentId: batch.documentId,
        expectedReservedQuantity: before,
        reservedQuantity: before + take,
      });
      remaining -= take;
      if (remaining === 0) break;
    }

    if (remaining > 0) {
      const tracked = productBatches.reduce(
        (sum, batch) => sum + Number(batch.quantity),
        0,
      );
      const legacyReserved = Number(
        inventory.legacyReserved?.[item.slug] ?? 0,
      );
      const legacyAvailable = Number(product.stock) - tracked - legacyReserved;
      if (!validQuantity(legacyReserved) || legacyAvailable < remaining) {
        const available = item.qty - remaining + Math.max(0, legacyAvailable);
        throw new Error(
          `Only ${available} unit(s) of ${product.name ?? item.slug} are available.`,
        );
      }
      allocations.push({
        productDocumentId: product.documentId,
        slug: product.slug,
        sku: product.sku,
        name: product.name,
        batchDocumentId: null,
        batchNumber: "LEGACY-STOCK",
        qty: remaining,
      });
    }
  }
  return { allocations, batchUpdates };
}

function createStockReservationService(adapter) {
  async function replay(idempotencyKey, binding) {
    return adapter.transaction(async (tx) => {
      const reservation = await tx.findReservationByIdempotencyKey(
        idempotencyKey,
      );
      return assertReplay(reservation, binding);
    });
  }

  return {
    async reserve(input) {
      const idempotencyKey = text(input?.idempotencyKey);
      if (!idempotencyKey || idempotencyKey.length > 200) {
        throw new Error("Reservation idempotency key is required.");
      }
      const items = canonicalItems(input.items);
      const binding = requestBinding(input, items);
      const now = new Date(input.now ?? Date.now());
      if (!Number.isFinite(now.getTime())) {
        throw new Error("Reservation time is invalid.");
      }
      try {
        return await adapter.transaction(async (tx) => {
          const existing = await tx.findReservationByIdempotencyKey(
            idempotencyKey,
          );
          if (existing) return assertReplay(existing, binding);

          const inventory = await tx.lockInventory(
            items.map((item) => item.slug),
            now,
          );
          const winner = await tx.findReservationByIdempotencyKey(
            idempotencyKey,
          );
          if (winner) return assertReplay(winner, binding);

          const { allocations, batchUpdates } = planAllocations(
            items,
            inventory,
            now,
          );
          await tx.updateBatchReservations(batchUpdates);
          return tx.createReservation({
            token: `rsv_${crypto.randomUUID()}`,
            idempotencyKey,
            requestBinding: binding,
            status: "reserved",
            allocations,
            expiresAt: reservationExpiryForSelection(
              now,
              binding.shippingSelection,
            ),
            email: binding.email,
            customerDocumentId: binding.customerDocumentId,
          });
        });
      } catch (error) {
        if (adapter.isUniqueConflict?.(error)) {
          return replay(idempotencyKey, binding);
        }
        throw error;
      }
    },

    async expireOne(documentId, nowValue = new Date()) {
      const now = new Date(nowValue);
      if (!Number.isFinite(now.getTime())) {
        throw new Error("Reservation expiry time is invalid.");
      }
      return adapter.transaction(async (tx) => {
        const reservation = await tx.lockReservation(documentId);
        if (!reservation || reservation.status !== "reserved" ||
            new Date(reservation.expiresAt).getTime() >= now.getTime()) {
          return false;
        }
        await tx.releaseBatchAllocations(reservation.allocations);
        await tx.updateReservationStatus(documentId, "expired");
        return true;
      });
    },

    async expireDue(nowValue = new Date(), limit = 500) {
      const now = new Date(nowValue);
      const due = await adapter.findExpiredReservations(now, limit);
      let expired = 0;
      for (const reservation of due) {
        if (await this.expireOne(reservation.documentId, now)) expired += 1;
      }
      return expired;
    },
  };
}

function cloneMap(map) {
  return new Map(
    [...map.entries()].map(([key, value]) => [
      key,
      structuredClone(value),
    ]),
  );
}

function createMemoryStockReservationAdapter(options = {}) {
  const state = {
    products: new Map(
      (options.products ?? []).map((item) => [
        item.documentId,
        structuredClone(item),
      ]),
    ),
    batches: new Map(
      (options.batches ?? []).map((item) => [
        item.documentId,
        structuredClone(item),
      ]),
    ),
    reservations: new Map(
      (options.reservations ?? []).map((item) => [
        item.documentId,
        structuredClone(item),
      ]),
    ),
  };
  let sequence = state.reservations.size;
  let tail = Promise.resolve();

  return {
    state,
    async transaction(work) {
      let unlock;
      const previous = tail;
      tail = new Promise((resolve) => {
        unlock = resolve;
      });
      await previous;
      const snapshot = {
        products: cloneMap(state.products),
        batches: cloneMap(state.batches),
        reservations: cloneMap(state.reservations),
        sequence,
      };
      const tx = {
        async findReservationByIdempotencyKey(key) {
          return [...state.reservations.values()].find(
            (entry) => entry.idempotencyKey === key,
          );
        },
        async lockInventory(slugs) {
          const slugSet = new Set(slugs);
          const reservations = [...state.reservations.values()]
            .filter((entry) => entry.status === "reserved");
          const legacyReserved = {};
          for (const reservation of reservations) {
            for (const allocation of reservation.allocations ?? []) {
              if (!allocation.batchDocumentId && slugSet.has(allocation.slug)) {
                legacyReserved[allocation.slug] =
                  (legacyReserved[allocation.slug] ?? 0) + allocation.qty;
              }
            }
          }
          return {
            products: [...state.products.values()]
              .filter((entry) => slugSet.has(entry.slug))
              .map((entry) => structuredClone(entry)),
            batches: [...state.batches.values()]
              .filter((entry) => slugSet.has(entry.slug))
              .map((entry) => structuredClone(entry)),
            legacyReserved,
          };
        },
        async updateBatchReservations(updates) {
          for (const update of updates) {
            const current = state.batches.get(update.documentId);
            if (!current ||
                current.reservedQuantity !== update.expectedReservedQuantity) {
              throw new Error("Inventory batch reservation changed.");
            }
            current.reservedQuantity = update.reservedQuantity;
          }
        },
        async createReservation(data) {
          if (options.failCreate) {
            throw new Error("Simulated create failure.");
          }
          if ([...state.reservations.values()].some(
            (entry) => entry.idempotencyKey === data.idempotencyKey,
          )) {
            const error = new Error("Unique constraint");
            error.code = "23505";
            throw error;
          }
          sequence += 1;
          const reservation = {
            documentId: `reservation-${sequence}`,
            ...structuredClone(data),
          };
          state.reservations.set(
            reservation.documentId,
            structuredClone(reservation),
          );
          return reservation;
        },
        async lockReservation(documentId) {
          return state.reservations.get(documentId);
        },
        async releaseBatchAllocations(allocations) {
          const totals = new Map();
          for (const allocation of allocations ?? []) {
            if (!allocation.batchDocumentId) continue;
            totals.set(
              allocation.batchDocumentId,
              (totals.get(allocation.batchDocumentId) ?? 0) + allocation.qty,
            );
          }
          for (const [documentId, qty] of [...totals.entries()]
            .sort(([left], [right]) => left.localeCompare(right))) {
            const batch = state.batches.get(documentId);
            if (!batch || !Number.isSafeInteger(qty) || qty <= 0 ||
                !Number.isSafeInteger(batch.reservedQuantity) ||
                batch.reservedQuantity < qty) {
              throw new Error("Inventory batch reserved quantity is invalid.");
            }
            batch.reservedQuantity -= qty;
          }
        },
        async updateReservationStatus(documentId, status) {
          const reservation = state.reservations.get(documentId);
          if (!reservation) throw new Error("Reservation not found.");
          reservation.status = status;
        },
      };
      try {
        return await work(tx);
      } catch (error) {
        state.products = snapshot.products;
        state.batches = snapshot.batches;
        state.reservations = snapshot.reservations;
        sequence = snapshot.sequence;
        throw error;
      } finally {
        unlock();
      }
    },
    async findExpiredReservations(now, limit) {
      return [...state.reservations.values()]
        .filter((entry) =>
          entry.status === "reserved" &&
          new Date(entry.expiresAt).getTime() < now.getTime())
        .slice(0, limit);
    },
    isUniqueConflict(error) {
      return error?.code === "23505";
    },
  };
}

function aggregateLegacyReservations(reservations, slugs, maximum = 1_000) {
  if (!Array.isArray(reservations) || reservations.length > maximum) {
    throw new Error("Active legacy reservation selection is not bounded.");
  }
  const selected = new Set(slugs);
  const result = {};
  for (const reservation of reservations ?? []) {
    for (const allocation of reservation.allocations ?? []) {
      if (!allocation.batchDocumentId && selected.has(allocation.slug)) {
        result[allocation.slug] =
          (result[allocation.slug] ?? 0) + Number(allocation.qty);
      }
    }
  }
  return result;
}

function createStrapiStockReservationAdapter(strapi) {
  const reservationQuery = () =>
    strapi.db.query("api::stock-reservation.stock-reservation");
  const productQuery = () => strapi.db.query("api::product.product");
  const batchQuery = () =>
    strapi.db.query("api::inventory-batch.inventory-batch");

  return {
    async transaction(work) {
      return strapi.db.transaction(async ({ trx }) => {
        const tx = {
          async findReservationByIdempotencyKey(idempotencyKey) {
            return reservationQuery().findOne(withTransaction(trx, {
              where: { idempotencyKey },
            }));
          },
          async lockInventory(slugs) {
            const productCandidates = await productQuery().findMany(
              withTransaction(trx, {
                where: {
                  slug: { $in: slugs },
                  publishedAt: { $notNull: true },
                },
              }),
            );
            const batchCandidates = await batchQuery().findMany(
              withTransaction(trx, {
                where: { slug: { $in: slugs } },
                limit: 501,
              }),
            );
            if (batchCandidates.length > 500) {
              throw new Error("Inventory batch selection is not bounded.");
            }
            for (const documentId of batchCandidates
              .map((entry) => entry.documentId)
              .filter(Boolean)
              .sort()) {
              await strapi.db.connection("inventory_batches")
                .where({ document_id: documentId })
                .transacting(trx)
                .forUpdate()
                .first();
            }
            for (const documentId of productCandidates
              .map((entry) => entry.documentId)
              .filter(Boolean)
              .sort()) {
              await strapi.db.connection("products")
                .where({ document_id: documentId })
                .transacting(trx)
                .forUpdate()
                .first();
            }
            const products = await productQuery().findMany(
              withTransaction(trx, {
                where: {
                  slug: { $in: slugs },
                  publishedAt: { $notNull: true },
                },
              }),
            );
            const batches = await batchQuery().findMany(
              withTransaction(trx, {
                where: { slug: { $in: slugs } },
                limit: 501,
              }),
            );
            const candidateBatchIds = batchCandidates
              .map((entry) => entry.documentId)
              .filter(Boolean)
              .sort();
            const lockedBatchIds = batches
              .map((entry) => entry.documentId)
              .filter(Boolean)
              .sort();
            if (batches.length > 500 ||
                !same(candidateBatchIds, lockedBatchIds)) {
              throw new Error("Inventory batch binding changed.");
            }
            const active = await reservationQuery().findMany(
              withTransaction(trx, {
                where: { status: "reserved" },
                limit: 1001,
              }),
            );
            return {
              products,
              batches,
              legacyReserved: aggregateLegacyReservations(
                active,
                slugs,
                1_000,
              ),
            };
          },
          async updateBatchReservations(updates) {
            for (const update of updates) {
              const batch = await batchQuery().findOne(
                withTransaction(trx, {
                  where: { documentId: update.documentId },
                }),
              );
              if (!batch ||
                  Number(batch.reservedQuantity ?? 0) !==
                    update.expectedReservedQuantity) {
                throw new Error("Inventory batch reservation changed.");
              }
              await batchQuery().update(withTransaction(trx, {
                where: { documentId: update.documentId },
                data: { reservedQuantity: update.reservedQuantity },
              }));
            }
          },
          async createReservation(data) {
            return reservationQuery().create(withTransaction(trx, { data }));
          },
          async lockReservation(documentId) {
            const candidate = await reservationQuery().findOne(
              withTransaction(trx, { where: { documentId } }),
            );
            if (!candidate?.documentId) return undefined;
            await strapi.db.connection("stock_reservations")
              .where({ document_id: candidate.documentId })
              .transacting(trx)
              .forUpdate()
              .first();
            return reservationQuery().findOne(withTransaction(trx, {
              where: { documentId: candidate.documentId },
            }));
          },
          async releaseBatchAllocations(allocations) {
            const totals = new Map();
            for (const allocation of allocations ?? []) {
              if (!allocation.batchDocumentId) continue;
              totals.set(
                allocation.batchDocumentId,
                (totals.get(allocation.batchDocumentId) ?? 0) +
                  Number(allocation.qty),
              );
            }
            for (const [documentId, qty] of [...totals.entries()]
              .sort(([left], [right]) => left.localeCompare(right))) {
              await strapi.db.connection("inventory_batches")
                .where({ document_id: documentId })
                .transacting(trx)
                .forUpdate()
                .first();
              const batch = await batchQuery().findOne(withTransaction(trx, {
                where: { documentId },
              }));
              const reserved = Number(batch?.reservedQuantity);
              if (!batch || !Number.isSafeInteger(qty) || qty <= 0 ||
                  !Number.isSafeInteger(reserved) || reserved < qty) {
                throw new Error(
                  "Inventory batch reserved quantity is invalid.",
                );
              }
              await batchQuery().update(withTransaction(trx, {
                where: { documentId },
                data: { reservedQuantity: reserved - qty },
              }));
            }
          },
          async updateReservationStatus(documentId, status) {
            await reservationQuery().update(withTransaction(trx, {
              where: { documentId },
              data: { status },
            }));
          },
        };
        return work(tx);
      });
    },
    async findExpiredReservations(now, limit) {
      return reservationQuery().findMany({
        where: {
          status: "reserved",
          expiresAt: { $lt: now.toISOString() },
        },
        orderBy: [{ expiresAt: "asc" }, { documentId: "asc" }],
        limit: Math.min(500, Math.max(1, Number(limit) || 500)),
      });
    },
    isUniqueConflict(error) {
      return error?.code === "23505" ||
        error?.original?.code === "23505" ||
        /unique/i.test(String(error?.message ?? ""));
    },
  };
}

module.exports = {
  aggregateLegacyReservations,
  canonicalItems,
  createMemoryStockReservationAdapter,
  createStockReservationService,
  createStrapiStockReservationAdapter,
  planAllocations,
};
