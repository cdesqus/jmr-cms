"use strict";

const {
  selectShippingQuote,
  validateShippingSnapshot,
} = require("../../shipping-operations/services/shipping-domain.cjs");

function enabled(env) {
  if (env.MEMBERSHIP_ENABLED !== "true") throw new Error("Not found.");
}
function positive(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer.`);
  return value;
}
function add(a, b, name) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error(`${name} must be a safe integer.`);
  return result;
}
function multiply(a, b, name) {
  const result = a * b;
  if (!Number.isSafeInteger(result)) throw new Error(`${name} must be a safe integer.`);
  return result;
}
function same(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function shippingEnabled(env) {
  return env.SHIPPING_ENABLED === "true";
}

function shippingSecret(env) {
  return env.SHIPPING_QUOTE_SECRET || env.JAMORA_STOREFRONT_API_SECRET;
}

function itemsInLockOrder(items) {
  return (Array.isArray(items) ? [...items] : []).sort((left, right) =>
    String(left?.slug ?? "").localeCompare(String(right?.slug ?? "")));
}

function formatShippingAddress(address) {
  const unit = address.unit ? `, ap. ${address.unit}` : "";
  const county = address.subdivisionCode ? `, ${address.subdivisionCode}` : "";
  const phone = address.phone ? `\nTelefon: ${address.phone}` : "";
  const instructions = address.instructions ? `\nInstrucțiuni: ${address.instructions}` : "";
  return `${address.recipient}\n${address.street} ${address.building}${unit}\n` +
    `${address.postalCode} ${address.locality}${county}\nRomania${phone}${instructions}`;
}

function publicQuoteFromSnapshot(snapshot) {
  return {
    quoteId: snapshot.quoteId,
    carrier: snapshot.carrier,
    service: snapshot.service,
    amountMinor: snapshot.amountMinor,
    currency: snapshot.currency,
    estimate: snapshot.estimate,
    quotedAt: snapshot.quotedAt,
    expiresAt: snapshot.expiresAt,
  };
}

function assertShippingReplay(checkout, input, env) {
  if (!shippingEnabled(env)) return;
  const quote = checkout.shippingSnapshot?.quote;
  if (!quote ||
      !same(publicQuoteFromSnapshot(quote), input.shippingSelection) ||
      !same(checkout.shippingSnapshot?.shippingAddress, input.shippingSnapshot?.shippingAddress)) {
    throw new Error("Checkout idempotency conflict.");
  }
}

function pendingOrderMatchesCheckout(order, checkout) {
  const shipping = checkout.shippingSnapshot ?? {};
  return order?.status === "pending" &&
    order.customerDocumentId === checkout.customerDocumentId &&
    order.membershipDocumentId === checkout.membershipDocumentId &&
    order.checkoutReference === checkout.checkoutReference &&
    order.currency?.toUpperCase() === checkout.currency &&
    order.subtotalCents === checkout.totals.merchandiseMinor &&
    order.shippingCents === checkout.totals.shippingMinor &&
    order.discountCents === 0 &&
    order.totalCents === checkout.totals.totalMinor &&
    same(order.items, checkout.items) &&
    (order.shippingAddressText ?? "") === (shipping.shippingAddressText ?? "") &&
    same(order.shippingAddress, shipping.shippingAddress) &&
    (!shipping.quote || same(order.shippingSnapshot, shipping));
}

function createMembershipCheckoutService(adapter, env = process.env) {
  const ttlSeconds = checkoutTtlSeconds(env.MEMBERSHIP_CHECKOUT_TTL_SECONDS);

  async function revalidateShipping(tx, checkout, now) {
    if (!shippingEnabled(env)) return checkout.shippingSnapshot;
    const products = [];
    for (const item of itemsInLockOrder(checkout.items)) {
      const product = await tx.lockProductBySlug(item.slug);
      if (!product) throw new Error("Shipping snapshot binding changed.");
      products.push(product);
    }
    validateShippingSnapshot({
      snapshot: checkout.shippingSnapshot?.quote,
      address: checkout.shippingSnapshot?.shippingAddress,
      items: checkout.items,
      products,
    }, {
      secret: shippingSecret(env),
      now,
    });
    return checkout.shippingSnapshot;
  }

  async function settleReserved(tx, checkout, status) {
    if (checkout.status !== "reserved") return { ...checkout, idempotent: true };
    const credit = await tx.lockCreditReservation(checkout.checkoutReference);
    if (!credit || credit.membershipDocumentId !== checkout.membershipDocumentId ||
        credit.credits !== checkout.totals.creditsRequired) {
      throw new Error("Checkout credit binding is invalid.");
    }
    if (credit.status === "reserved") {
      await tx.releaseStock(checkout.items);
      await tx.releaseCredits(credit);
    } else if (credit.status !== "release") {
      throw new Error("Checkout credit is already settled.");
    }
    await tx.setCheckoutStatus(checkout.checkoutReference, status);
    return { ...checkout, status, idempotent: false };
  }

  async function expireOne(reference, now) {
    return adapter.transaction(async (tx) => {
      const checkout = await tx.lockCheckout(reference);
      if (!checkout || checkout.status !== "reserved" ||
          new Date(checkout.expiresAt) > now) return false;
      await settleReserved(tx, checkout, "expired");
      return true;
    });
  }

  return {
    async reserve(input) {
      enabled(env);
      try {
        return await adapter.transaction(async (tx) => {
        const replay = await tx.findCheckout(input.checkoutReference);
        if (replay) {
          if (replay.customerDocumentId !== input.customerDocumentId ||
              replay.membershipDocumentId !== input.membershipDocumentId ||
              replay.idempotencyKey !== input.idempotencyKey) {
            throw new Error("Checkout idempotency conflict.");
          }
          assertShippingReplay(replay, input, env);
          return replay;
        }
        const membership = await tx.lockMembership(input.membershipDocumentId);
        if (!membership || membership.customerDocumentId !== input.customerDocumentId) {
          throw new Error("Membership not found.");
        }
        const now = new Date(input.now ?? Date.now());
        if (membership.status !== "active" || now < new Date(membership.startsAt) ||
            now >= new Date(membership.endsAt)) throw new Error("Membership is not active.");
        let coveredMerchandiseMinor = 0;
        let creditsRequired = 0;
        const authoritativeItems = [];
        const authoritativeProducts = [];
        for (const requested of itemsInLockOrder(input.items)) {
          const qty = positive(requested.qty, "qty");
          const product = await tx.lockProductBySlug(requested.slug);
          if (!product || !membership.eligibleProductSlugs.includes(product.slug)) {
            throw new Error("Product is not eligible.");
          }
          const creditCost = positive(product.creditCost, "creditCost");
          const unitPriceMinor = positive(product.priceCents, "priceCents");
          const stockIdentity = {
            documentId: product.documentId,
            ...(Number.isSafeInteger(product.id) && product.id > 0
              ? { rowId: product.id }
              : {}),
          };
          await tx.reserveStock(stockIdentity, qty);
          coveredMerchandiseMinor = add(coveredMerchandiseMinor, multiply(qty, unitPriceMinor, "covered merchandise"), "covered merchandise");
          creditsRequired = add(creditsRequired, multiply(qty, creditCost, "credits"), "credits");
          authoritativeItems.push({
            productDocumentId: product.documentId, slug: product.slug,
            qty, unitPriceMinor, creditCost,
            ...(stockIdentity.rowId ? { productRowId: stockIdentity.rowId } : {}),
          });
          authoritativeProducts.push(product);
        }
        if (!authoritativeItems.length) throw new Error("Cart is empty.");
        if (creditsRequired > membership.ledgerBalance) throw new Error("Insufficient credits.");
        let currency = "EUR";
        let shippingSnapshot = input.shippingSnapshot ?? {};
        let shippingMinor;
        if (shippingEnabled(env)) {
          const shippingAddress = shippingSnapshot.shippingAddress;
          const selected = selectShippingQuote({
            selection: input.shippingSelection,
            address: shippingAddress,
            items: authoritativeItems,
            products: authoritativeProducts,
          }, {
            secret: shippingSecret(env),
            now,
          }).snapshot;
          currency = "RON";
          shippingMinor = selected.amountMinor;
          shippingSnapshot = {
            customerName: typeof shippingSnapshot.customerName === "string"
              ? shippingSnapshot.customerName.trim()
              : "",
            email: typeof shippingSnapshot.email === "string"
              ? shippingSnapshot.email.trim()
              : "",
            shippingAddressText: formatShippingAddress(shippingAddress),
            shippingAddress: structuredClone(shippingAddress),
            estimatedDelivery: structuredClone(selected.estimate),
            quote: selected,
          };
        } else {
          shippingMinor = positive(await tx.quoteShipping(authoritativeItems), "shippingMinor");
        }
        await tx.reserveCredits({
          membershipDocumentId: membership.documentId,
          checkoutReference: input.checkoutReference,
          credits: creditsRequired,
        });
        const configuredExpiry = new Date(
          now.getTime() + ttlSeconds * 1000,
        );
        const quoteExpiry = shippingSnapshot.quote
          ? new Date(shippingSnapshot.quote.expiresAt)
          : configuredExpiry;
        const checkoutExpiry = quoteExpiry > configuredExpiry
          ? quoteExpiry
          : configuredExpiry;
        return tx.createCheckout({
          checkoutReference: input.checkoutReference,
          idempotencyKey: input.idempotencyKey,
          customerDocumentId: input.customerDocumentId,
          membershipDocumentId: membership.documentId,
          currency,
          items: authoritativeItems,
          totals: {
            merchandiseMinor: 0, coveredMerchandiseMinor, creditsRequired,
            shippingMinor, totalMinor: shippingMinor,
          },
          shippingSnapshot,
          status: "reserved",
          expiresAt: checkoutExpiry.toISOString(),
        });
        });
      } catch (error) {
        if (/idempotency conflict/i.test(error?.message)) throw error;
        const winner = await adapter.findCheckout?.(input.checkoutReference);
        if (winner && winner.customerDocumentId === input.customerDocumentId &&
            winner.membershipDocumentId === input.membershipDocumentId &&
            winner.idempotencyKey === input.idempotencyKey) {
          assertShippingReplay(winner, input, env);
          return winner;
        }
        throw error;
      }
    },

    async preparePendingOrder(input) {
      enabled(env);
      if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
        throw new Error("idempotencyKey is required.");
      }
      return adapter.transaction(async (tx) => {
        const checkout = await tx.lockCheckout(input.checkoutReference);
        if (!checkout || checkout.customerDocumentId !== input.customerDocumentId) {
          throw new Error("Checkout not found.");
        }
        if (checkout.status !== "reserved") throw new Error("Checkout is already settled.");
        const now = new Date(input.now ?? Date.now());
        if (now >= new Date(checkout.expiresAt)) {
          await settleReserved(tx, checkout, "expired");
          const error = new Error("Checkout reservation expired.");
          error.compensated = true;
          throw error;
        }
        await revalidateShipping(tx, checkout, now);
        if (checkout.orderDocumentId) {
          const order = await tx.lockOrder(checkout.orderDocumentId);
          if (!pendingOrderMatchesCheckout(order, checkout)) {
            throw new Error("Checkout order binding is invalid.");
          }
          return { checkout, order, idempotent: true };
        }
        const order = await tx.createPendingOrder(checkout, input.orderMetadata ?? {});
        if (!pendingOrderMatchesCheckout(order, checkout)) {
          throw new Error("Checkout order binding is invalid.");
        }
        await tx.bindCheckoutOrder(checkout.checkoutReference, order.documentId);
        return {
          checkout: { ...checkout, orderDocumentId: order.documentId },
          order,
          idempotent: false,
        };
      });
    },

    async finalize(input) {
      enabled(env);
      if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
        throw new Error("idempotencyKey is required.");
      }
      return adapter.transaction(async (tx) => {
        const checkout = await tx.lockCheckout(input.checkoutReference);
        if (!checkout || checkout.customerDocumentId !== input.customerDocumentId) {
          throw new Error("Checkout not found.");
        }
        if (checkout.status === "paid" && checkout.orderDocumentId) {
          if (checkout.settlementKey !== input.idempotencyKey ||
              (input.orderDocumentId &&
               input.orderDocumentId !== checkout.orderDocumentId)) {
            throw new Error("Checkout settlement idempotency conflict.");
          }
          const replayOrder = await tx.lockOrder(checkout.orderDocumentId);
          if (!replayOrder ||
              replayOrder.customerDocumentId !== checkout.customerDocumentId ||
              replayOrder.checkoutReference !== checkout.checkoutReference ||
              replayOrder.status !== "paid" ||
              (input.paymentDocumentId &&
               replayOrder.paymentDocumentId !== input.paymentDocumentId)) {
            throw new Error("Checkout order binding is invalid.");
          }
          return { checkout, order: replayOrder, idempotent: true };
        }
        if (checkout.status !== "reserved") throw new Error("Checkout is already settled.");
        const now = new Date(input.now ?? Date.now());
        if (now >= new Date(checkout.expiresAt)) {
          await settleReserved(tx, checkout, "expired");
          const error = new Error("Checkout reservation expired.");
          error.compensated = true;
          throw error;
        }
        await revalidateShipping(tx, checkout, now);
        let order = input.orderDocumentId
          ? await tx.lockOrder(input.orderDocumentId)
          : null;
        if (input.orderDocumentId && (!order ||
            order.customerDocumentId !== checkout.customerDocumentId ||
            order.checkoutReference !== checkout.checkoutReference ||
            order.status !== "paid" ||
            (input.paymentDocumentId &&
             order.paymentDocumentId !== input.paymentDocumentId))) {
          throw new Error("Paid checkout order not found.");
        }
        const membership = await tx.lockMembership(checkout.membershipDocumentId);
        const credit = await tx.lockCreditReservation(checkout.checkoutReference);
        if (!membership || membership.customerDocumentId !== checkout.customerDocumentId ||
            !credit || credit.membershipDocumentId !== membership.documentId ||
            credit.status !== "reserved" || credit.credits !== checkout.totals.creditsRequired) {
          throw new Error("Checkout binding is invalid.");
        }
        if (membership.status !== "active" || now < new Date(membership.startsAt) ||
            now >= new Date(membership.endsAt)) {
          await settleReserved(tx, checkout, "released");
          const error = new Error("Membership is no longer active.");
          error.compensated = true;
          throw error;
        }
        const membershipSnapshot = {
          membershipDocumentId: membership.documentId,
          checkoutReference: checkout.checkoutReference,
          creditsRedeemed: checkout.totals.creditsRequired,
          coveredMerchandiseMinor: checkout.totals.coveredMerchandiseMinor,
          merchandiseMinor: 0,
          shippingMinor: checkout.totals.shippingMinor,
        };
        try {
          order ??= await tx.createPaidOrder(checkout, input.orderMetadata ?? {});
          if (!order || order.customerDocumentId !== checkout.customerDocumentId ||
              order.checkoutReference !== checkout.checkoutReference ||
              order.status !== "paid") throw new Error("Payment order binding failed.");
          await tx.consumeStock(checkout.items);
          await tx.redeemCredits(credit, order.documentId);
          const updated = await tx.finalizeOrder(order.documentId, {
            subtotalCents: 0, discountCents: 0,
            shippingCents: checkout.totals.shippingMinor,
            totalCents: checkout.totals.shippingMinor,
            membershipDocumentId: membership.documentId,
            membershipSnapshot,
            ...(checkout.shippingSnapshot?.quote
              ? {
                  priceSnapshot: {
                    charge: {
                      amountMinor: checkout.totals.shippingMinor,
                      currency: "RON",
                    },
                    items: checkout.items.map((item) => ({
                      productDocumentId: item.productDocumentId,
                      slug: item.slug,
                      sku: item.sku,
                      name: item.name,
                      qty: item.qty,
                      unitPriceMinor: 0,
                      lineTotalMinor: 0,
                      currency: "RON",
                    })),
                    shipping: structuredClone(
                      checkout.shippingSnapshot.quote,
                    ),
                    breakdown: {
                      subtotalMinor: 0,
                      shippingMinor: checkout.totals.shippingMinor,
                      discountMinor: 0,
                      totalMinor: checkout.totals.shippingMinor,
                      currency: "RON",
                    },
                  },
                }
              : {}),
          });
          await tx.setCheckoutStatus(
            checkout.checkoutReference,
            "paid",
            order.documentId,
            input.idempotencyKey,
          );
          return {
            checkout: {
              ...checkout,
              status: "paid",
              orderDocumentId: order.documentId,
              settlementKey: input.idempotencyKey,
            },
            order: updated,
          };
        } catch (error) {
          await tx.releaseStock(checkout.items);
          await tx.releaseCredits(credit);
          if (order) await tx.failOrder(order.documentId, "Membership redemption failed.");
          await tx.setCheckoutStatus(checkout.checkoutReference, "failed");
          error.compensated = true;
          throw error;
        }
      }, input.trx);
    },

    async release(input) {
      enabled(env);
      if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
        throw new Error("idempotencyKey is required.");
      }
      return adapter.transaction(async (tx) => {
        const checkout = await tx.lockCheckout(input.checkoutReference);
        if (!checkout || checkout.customerDocumentId !== input.customerDocumentId) {
          throw new Error("Checkout not found.");
        }
        if (checkout.status === "released" || checkout.status === "expired") {
          return { ...checkout, idempotent: true };
        }
        if (checkout.status !== "reserved") throw new Error("Checkout is already settled.");
        return settleReserved(tx, checkout, "released");
      });
    },

    async expireDue(now = new Date(), limit = 100) {
      enabled(env);
      const bounded = Math.min(Math.max(positive(limit, "limit"), 1), 100);
      const instant = now instanceof Date ? now : new Date(now);
      const due = await adapter.findExpired(instant, bounded);
      let count = 0;
      for (const checkout of due) {
        if (await expireOne(checkout.checkoutReference, instant)) count += 1;
      }
      return count;
    },
  };
}

function checkoutTtlSeconds(value) {
  if (value === undefined || value === "") return 600;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 60 || parsed > 3600) {
    throw new Error("MEMBERSHIP_CHECKOUT_TTL_SECONDS must be between 60 and 3600.");
  }
  return parsed;
}

function createMemoryMembershipCheckoutAdapter(options = {}) {
  const adapter = {
    memberships: new Map((options.memberships ?? []).map((x) => [x.documentId, structuredClone(x)])),
    products: new Map((options.products ?? []).map((x) => [x.documentId, structuredClone(x)])),
    stock: new Map((options.products ?? []).map((x) => [x.documentId, x.stock])),
    checkouts: new Map(),
    creditReservations: new Map(),
    orders: new Map(),
    queue: Promise.resolve(),
    findCheckout: async (id) => adapter.checkouts.get(id),
    findExpired: async (now, limit) => [...adapter.checkouts.values()]
      .filter((checkout) => checkout.status === "reserved" && new Date(checkout.expiresAt) <= now)
      .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
      .slice(0, limit),
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const snapshots = {
        stock: structuredClone([...adapter.stock]),
        checkouts: structuredClone([...adapter.checkouts]),
        credits: structuredClone([...adapter.creditReservations]),
        orders: structuredClone([...adapter.orders]),
      };
      try { return await work(memoryTx(adapter, options)); }
      catch (error) {
        // Failure compensation is an intentional committed terminal state.
        if (!error.compensated) {
          adapter.stock = new Map(snapshots.stock);
          adapter.checkouts = new Map(snapshots.checkouts);
          adapter.creditReservations = new Map(snapshots.credits);
          adapter.orders = new Map(snapshots.orders);
        }
        if (error.concurrentWinner) {
          const winner = error.concurrentWinner;
          adapter.checkouts.set(winner.checkoutReference, structuredClone(winner));
          for (const item of winner.items) {
            adapter.stock.set(item.productDocumentId, adapter.stock.get(item.productDocumentId) - item.qty);
          }
          adapter.creditReservations.set(winner.checkoutReference, {
            membershipDocumentId: winner.membershipDocumentId,
            checkoutReference: winner.checkoutReference,
            credits: winner.totals.creditsRequired,
            status: "reserved",
          });
        }
        throw error;
      } finally { release(); }
    },
  };
  return adapter;
}

function createStrapiMembershipCheckoutAdapter(strapi) {
  const query = (uid) => strapi.db.query(uid);
  const withTrx = (trx, value) => ({ ...value, transacting: trx });
  return {
    findCheckout: (reference) => query("api::membership-checkout.membership-checkout")
      .findOne({ where: { checkoutReference: reference } }),
    findExpired: (now, limit) => query("api::membership-checkout.membership-checkout")
      .findMany({
        where: { status: "reserved", expiresAt: { $lte: now.toISOString() } },
        orderBy: { expiresAt: "asc" },
        limit,
      }),
    async transaction(work, externalTrx) {
      if (externalTrx) return work(strapiTx(strapi, query, withTrx, externalTrx));
      let compensatedError;
      const result = await strapi.db.transaction(async ({ trx }) => {
        try { return await work(strapiTx(strapi, query, withTrx, trx)); }
        catch (error) {
          if (!error.compensated) throw error;
          compensatedError = error;
          return undefined;
        }
      });
      if (compensatedError) throw compensatedError;
      return result;
    },
  };
}

function strapiTx(strapi, query, withTrx, trx) {
  const membershipQ = query("api::membership.membership");
  const productQ = query("api::product.product");
  const checkoutQ = query("api::membership-checkout.membership-checkout");
  const ledgerQ = query("api::membership-credit-entry.membership-credit-entry");
  const orderQ = query("api::order.order");
  const productLocalized =
    strapi.contentTypes?.["api::product.product"]?.pluginOptions?.i18n?.localized === true;
  const productLocale = productLocalized
    ? String(process.env.SHIPPING_PRODUCT_LOCALE || "en").trim()
    : null;
  const publishedProductWhere = (where) => ({
    ...where,
    publishedAt: { $notNull: true },
    ...(productLocalized ? { locale: productLocale } : {}),
  });
  const lock = (table, documentId) => strapi.db.connection(table)
    .where({ document_id: documentId }).transacting(trx).forUpdate();
  const findCheckout = (reference) => checkoutQ.findOne(withTrx(trx, { where: { checkoutReference: reference } }));
  return {
    findCheckout,
    async lockCheckout(reference) {
      const row = await findCheckout(reference);
      if (row) await lock("membership_checkouts", row.documentId);
      return findCheckout(reference);
    },
    async lockMembership(id) {
      await lock("memberships", id);
      const membership = await membershipQ.findOne(withTrx(trx, { where: { documentId: id } }));
      if (!membership) return null;
      const entries = await ledgerQ.findMany(withTrx(trx, { where: { membershipDocumentId: id } }));
      let balance = 0;
      for (const entry of entries) {
        const credits = entry.kind === "admin_adjustment" ? entry.creditDelta : entry.credits;
        const delta = ({ grant: 1, release: 1, reverse: 1, admin_adjustment: 1, reserve: -1, redeem: 0, expire: -1 })[entry.kind];
        balance = add(balance, multiply(credits, delta, "ledger balance"), "ledger balance");
      }
      return {
        ...membership,
        ledgerBalance: balance,
        eligibleProductSlugs: membership.planSnapshot?.eligibleProductSlugs ?? [],
      };
    },
    async lockProductBySlug(slug) {
      if (productLocalized && !productLocale) {
        throw new Error("Authoritative membership product locale is required.");
      }
      const products = await productQ.findMany(withTrx(trx, {
        where: publishedProductWhere({ slug }),
      }));
      if (products.length !== 1) {
        throw new Error("Authoritative published membership product is missing or ambiguous.");
      }
      const product = products[0];
      if (!Number.isSafeInteger(product?.id) ||
          product.id <= 0 ||
          !product.documentId ||
          !Number.isFinite(new Date(product.publishedAt).getTime()) ||
          (productLocalized && product.locale !== productLocale)) {
        throw new Error("Authoritative published membership product is missing or ambiguous.");
      }
      await strapi.db.connection("products")
        .where({ id: product.id })
        .transacting(trx)
        .forUpdate()
        .first();
      const locked = await productQ.findOne(withTrx(trx, {
        where: publishedProductWhere({ id: product.id }),
      }));
      if (!locked ||
          locked.id !== product.id ||
          locked.documentId !== product.documentId ||
          locked.slug !== product.slug ||
          new Date(locked.publishedAt).toISOString() !==
            new Date(product.publishedAt).toISOString() ||
          (productLocalized && locked.locale !== productLocale)) {
        throw new Error("Authoritative published membership product changed.");
      }
      return locked;
    },
    async reserveStock(identity, qty) {
      if (!Number.isSafeInteger(identity?.rowId) || identity.rowId <= 0) {
        throw new Error("Authoritative published membership product row is required.");
      }
      const updated = await strapi.db.connection("products")
        .where({ id: identity.rowId }).andWhere("stock", ">=", qty)
        .transacting(trx).decrement("stock", qty);
      if (Number(updated) < 1) throw new Error("Insufficient stock.");
    },
    async reserveCredits(value) {
      await ledgerQ.create(withTrx(trx, { data: {
        entryId: crypto.randomUUID(),
        idempotencyKey: `checkout:${value.checkoutReference}:reserve`,
        membershipDocumentId: value.membershipDocumentId,
        checkoutReference: value.checkoutReference,
        kind: "reserve", credits: value.credits, actor: "customer",
        occurredAt: new Date().toISOString(),
      } }));
    },
    quoteShipping: async () => 495,
    createCheckout: (value) => checkoutQ.create(withTrx(trx, { data: value })),
    async lockOrder(id) {
      await lock("orders", id);
      return orderQ.findOne(withTrx(trx, { where: { documentId: id } }));
    },
    async createPaidOrder(checkout, metadata) {
      const now = new Date();
      const shipping = checkout.shippingSnapshot?.quote
        ? checkout.shippingSnapshot
        : metadata;
      return orderQ.create(withTrx(trx, { data: {
        orderNumber: metadata.orderNumber || `JMR-${now.getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        trackingNumber: metadata.trackingNumber || "",
        carrier: shipping.quote?.carrier || metadata.carrier || "Jamora EU Fulfilment",
        customerName: shipping.customerName || "",
        email: shipping.email || metadata.email,
        customerDocumentId: checkout.customerDocumentId,
        checkoutReference: checkout.checkoutReference,
        status: "paid", currency: checkout.currency.toLowerCase(),
        subtotalCents: 0, shippingCents: checkout.totals.shippingMinor,
        discountCents: 0, totalCents: checkout.totals.shippingMinor,
        items: checkout.items,
        reservationToken: checkout.checkoutReference,
        itemsSummary: JSON.stringify(checkout.items, null, 2),
        shippingAddressText: shipping.shippingAddressText || "",
        shippingAddress: shipping.shippingAddress,
        shippingSnapshot: shipping,
        estimatedDelivery: shipping.quote ? undefined : shipping.estimatedDelivery,
      } }));
    },
    async createPendingOrder(checkout, metadata) {
      const now = new Date();
      const shipping = checkout.shippingSnapshot ?? {};
      return orderQ.create(withTrx(trx, { data: {
        orderNumber: metadata.orderNumber || `JMR-${now.getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        trackingNumber: "", carrier: shipping.quote?.carrier || "Jamora EU Fulfilment",
        customerName: shipping.customerName || "",
        email: shipping.email,
        customerDocumentId: checkout.customerDocumentId,
        membershipDocumentId: checkout.membershipDocumentId,
        checkoutReference: checkout.checkoutReference,
        status: "pending", currency: checkout.currency.toLowerCase(),
        subtotalCents: 0, shippingCents: checkout.totals.shippingMinor,
        discountCents: 0, totalCents: checkout.totals.totalMinor,
        items: checkout.items,
        reservationToken: checkout.checkoutReference,
        itemsSummary: JSON.stringify(checkout.items, null, 2),
        shippingAddressText: shipping.shippingAddressText || "",
        shippingAddress: shipping.shippingAddress,
        shippingSnapshot: shipping,
        estimatedDelivery: shipping.quote ? undefined : shipping.estimatedDelivery,
        priceSnapshot: {
          membershipCheckout: {
            checkoutReference: checkout.checkoutReference,
            membershipDocumentId: checkout.membershipDocumentId,
            totals: checkout.totals,
          },
          ...(shipping.quote ? {
            charge: {
              amountMinor: checkout.totals.totalMinor,
              currency: "RON",
            },
            items: checkout.items.map((item) => ({
              productDocumentId: item.productDocumentId,
              slug: item.slug,
              sku: item.sku,
              name: item.name,
              qty: item.qty,
              unitPriceMinor: 0,
              lineTotalMinor: 0,
              currency: "RON",
            })),
            shipping: structuredClone(shipping.quote),
            breakdown: {
              subtotalMinor: 0,
              shippingMinor: checkout.totals.shippingMinor,
              discountMinor: 0,
              totalMinor: checkout.totals.totalMinor,
              currency: "RON",
            },
          } : {}),
        },
      } }));
    },
    bindCheckoutOrder: (reference, orderDocumentId) => checkoutQ.update(withTrx(trx, {
      where: { checkoutReference: reference }, data: { orderDocumentId },
    })),
    async lockCreditReservation(reference) {
      const credit = await ledgerQ.findOne(withTrx(trx, {
        where: { checkoutReference: reference, kind: "reserve" },
      }));
      if (!credit) return null;
      const settled = await ledgerQ.findOne(withTrx(trx, {
        where: { checkoutReference: reference, kind: { $in: ["release", "redeem"] } },
      }));
      return { ...credit, status: settled ? settled.kind : "reserved" };
    },
    consumeStock: async () => undefined,
    async redeemCredits(credit, orderDocumentId) {
      await ledgerQ.create(withTrx(trx, { data: {
        entryId: crypto.randomUUID(),
        idempotencyKey: `checkout:${credit.checkoutReference}:redeem`,
        membershipDocumentId: credit.membershipDocumentId,
        checkoutReference: credit.checkoutReference,
        orderDocumentId, kind: "redeem", credits: credit.credits,
        actor: "customer", occurredAt: new Date().toISOString(),
      } }));
    },
    async finalizeOrder(id, values) {
      await orderQ.update(withTrx(trx, { where: { documentId: id }, data: values }));
      return orderQ.findOne(withTrx(trx, { where: { documentId: id } }));
    },
    async releaseStock(items) {
      for (const item of items) {
        const exactRow =
          Number.isSafeInteger(item.productRowId) && item.productRowId > 0;
        if (!exactRow && !item.productDocumentId) {
          throw new Error("Checkout product row binding is invalid.");
        }
        const updated = await strapi.db.connection("products")
          .where(exactRow
            ? { id: item.productRowId }
            : { document_id: item.productDocumentId })
          .transacting(trx)
          .increment("stock", item.qty);
        if ((exactRow && Number(updated) !== 1) ||
            (!exactRow && Number(updated) < 1)) {
          throw new Error("Checkout product row binding is invalid.");
        }
      }
    },
    async releaseCredits(credit) {
      await ledgerQ.create(withTrx(trx, { data: {
        entryId: crypto.randomUUID(),
        idempotencyKey: `checkout:${credit.checkoutReference}:release`,
        membershipDocumentId: credit.membershipDocumentId,
        checkoutReference: credit.checkoutReference,
        kind: "release", credits: credit.credits, actor: "system",
        occurredAt: new Date().toISOString(),
      } }));
    },
    async failOrder(id, reason) {
      await orderQ.update(withTrx(trx, {
        where: { documentId: id },
        data: { status: "failed", nonFulfillable: true, failureReason: reason },
      }));
    },
    setCheckoutStatus: (reference, status, orderDocumentId, settlementKey) => checkoutQ.update(withTrx(trx, {
      where: { checkoutReference: reference }, data: { status, orderDocumentId, settlementKey },
    })),
  };
}

function memoryTx(adapter, options) {
  const productBySlug = (slug) => [...adapter.products.values()].find((x) => x.slug === slug);
  return {
    findCheckout: async (id) => adapter.checkouts.get(id),
    lockCheckout: async (id) => adapter.checkouts.get(id),
    lockMembership: async (id) => adapter.memberships.get(id),
    lockProductBySlug: async (slug) => productBySlug(slug),
    async reserveStock(identity, qty) {
      const available = adapter.stock.get(identity.documentId) ?? 0;
      if (available < qty) throw new Error("Insufficient stock.");
      adapter.stock.set(identity.documentId, available - qty);
    },
    async reserveCredits(value) {
      adapter.creditReservations.set(value.checkoutReference, { ...value, status: "reserved" });
    },
    quoteShipping: async () => 495,
    async createCheckout(value) {
      if (options.forceUniqueLoss && !adapter.checkouts.size) {
        const error = new Error("unique checkout conflict");
        error.concurrentWinner = structuredClone(value);
        throw error;
      }
      if (adapter.checkouts.has(value.checkoutReference)) throw new Error("unique checkout conflict");
      adapter.checkouts.set(value.checkoutReference, structuredClone(value));
      return value;
    },
    lockOrder: async (id) => adapter.orders.get(id),
    async createPaidOrder(checkout) {
      if (options.failCreateOrder) throw new Error("payment order creation failed");
      const documentId = `order:${checkout.checkoutReference}`;
      const order = {
        documentId,
        customerDocumentId: checkout.customerDocumentId,
        checkoutReference: checkout.checkoutReference,
        status: "paid",
      };
      adapter.orders.set(documentId, order);
      return order;
    },
    async createPendingOrder(checkout) {
      const documentId = `order:${checkout.checkoutReference}`;
      const shipping = checkout.shippingSnapshot ?? {};
      const order = {
        documentId,
        customerDocumentId: checkout.customerDocumentId,
        membershipDocumentId: checkout.membershipDocumentId,
        checkoutReference: checkout.checkoutReference,
        status: "pending",
        currency: checkout.currency.toLowerCase(),
        subtotalCents: 0,
        shippingCents: checkout.totals.shippingMinor,
        discountCents: 0,
        totalCents: checkout.totals.totalMinor,
        items: structuredClone(checkout.items),
        shippingAddressText: shipping.shippingAddressText || "",
        shippingAddress: structuredClone(shipping.shippingAddress),
        shippingSnapshot: structuredClone(shipping),
        priceSnapshot: { membershipCheckout: {
          checkoutReference: checkout.checkoutReference,
          membershipDocumentId: checkout.membershipDocumentId,
          totals: structuredClone(checkout.totals),
        },
        ...(shipping.quote ? {
          charge: {
            amountMinor: checkout.totals.totalMinor,
            currency: "RON",
          },
          items: checkout.items.map((item) => ({
            productDocumentId: item.productDocumentId,
            slug: item.slug,
            sku: item.sku,
            name: item.name,
            qty: item.qty,
            unitPriceMinor: 0,
            lineTotalMinor: 0,
            currency: "RON",
          })),
          shipping: structuredClone(shipping.quote),
          breakdown: {
            subtotalMinor: 0,
            shippingMinor: checkout.totals.shippingMinor,
            discountMinor: 0,
            totalMinor: checkout.totals.totalMinor,
            currency: "RON",
          },
        } : {}) },
      };
      adapter.orders.set(documentId, order);
      return order;
    },
    async bindCheckoutOrder(id, orderDocumentId) {
      adapter.checkouts.get(id).orderDocumentId = orderDocumentId;
    },
    lockCreditReservation: async (id) => adapter.creditReservations.get(id),
    consumeStock: async () => undefined,
    async redeemCredits(credit) {
      if (options.failRedeem) {
        const error = new Error("redeem failed");
        error.compensated = true;
        throw error;
      }
      credit.status = "redeemed";
    },
    async finalizeOrder(id, values) {
      Object.assign(adapter.orders.get(id), values);
      return adapter.orders.get(id);
    },
    async releaseStock(items) {
      for (const item of items) adapter.stock.set(item.productDocumentId, adapter.stock.get(item.productDocumentId) + item.qty);
    },
    async releaseCredits(credit) { credit.status = "released"; },
    async failOrder(id, reason) {
      Object.assign(adapter.orders.get(id), { status: "failed", nonFulfillable: true, failureReason: reason });
    },
    async setCheckoutStatus(id, status, orderDocumentId, settlementKey) {
      Object.assign(adapter.checkouts.get(id), { status, orderDocumentId, settlementKey });
    },
  };
}

module.exports = {
  createMembershipCheckoutService,
  createMemoryMembershipCheckoutAdapter,
  createStrapiMembershipCheckoutAdapter,
};
