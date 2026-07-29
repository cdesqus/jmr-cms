import { factories } from "@strapi/strapi";
import {
  assertAuthoritativePaymentSubjectBinding,
  assertOrderPaymentBinding,
  beneficiaryFromEnv,
  createPaymentTransactions,
  createPaymentSubjectSettlement,
  createStrapiPaymentAdapter,
  deriveAuthoritativePaymentSubject,
  lockAuthoritativeOrderSubject,
  paymentSubjectReservationToken,
} from "./payment-transaction.cjs";
const {
  createRoPayIntent,
  handleRoPayCallback,
  readRoPayStatus,
  verifyRoPayCallback,
  verifyRoPayStatus,
} = require("./ropay-adapter.cjs");
const {
  createRoPayAuthenticatedLimiter,
} = require("./ropay-authenticated-limiter.cjs");
const { projectAdminPayments } = require("./payment-admin-projection.cjs");
const { authorizePaymentStatus } = require("./payment-status.cjs");
const {
  assertReservationAllocationBinding,
  assertReservationProductBinding,
  nextPromotionUsage,
  settleOrdinaryOrder: settleOrdinaryOrderTransaction,
} = require("./order-payment-settlement.cjs");
const { withPaymentWriteAccess } = require(
  "../../payment/content-types/payment/payment-write-guard.cjs",
);

const uid = {
  payment: "api::payment.payment",
  order: "api::order.order",
  reservation: "api::stock-reservation.stock-reservation",
  checkout: "api::membership-checkout.membership-checkout",
  batch: "api::inventory-batch.inventory-batch",
  movement: "api::inventory-movement.inventory-movement",
  product: "api::product.product",
  promotion: "api::promotion.promotion",
};

export default factories.createCoreService(uid.payment as any, ({ strapi }) => {
  function assertPaymentsEnabled() {
    if (process.env.PAYMENTS_ENABLED !== "true") throw new Error("Not found.");
  }

  function assertRoPayEnabled() {
    assertPaymentsEnabled();
    if (process.env.ROPAY_ENABLED !== "true") throw new Error("Not found.");
  }

  const withTransaction = (trx: any, value: any) => ({ ...value, transacting: trx });

  async function lockDocument(
    uidValue: string,
    table: string,
    documentId: string,
    trx: any,
  ) {
    await strapi.db.connection(table)
      .where({ document_id: documentId })
      .transacting(trx)
      .forUpdate()
      .first();
    return strapi.db.query(uidValue).findOne(withTransaction(trx, {
      where: { documentId },
    }));
  }

  async function lockReservation(token: string, trx: any) {
    if (!token) return null;
    const query = strapi.db.query(uid.reservation);
    const candidate = await query.findOne(withTransaction(trx, {
      where: { token },
    }));
    if (!candidate) return null;
    await strapi.db.connection("stock_reservations")
      .where({ document_id: candidate.documentId })
      .transacting(trx)
      .forUpdate()
      .first();
    return query.findOne(withTransaction(trx, {
      where: { documentId: candidate.documentId },
    }));
  }

  async function lockCheckout(reference: string, trx: any) {
    const query = strapi.db.query(uid.checkout);
    const candidate = await query.findOne(withTransaction(trx, {
      where: { checkoutReference: reference },
    }));
    if (!candidate) return null;
    await strapi.db.connection("membership_checkouts")
      .where({ document_id: candidate.documentId })
      .transacting(trx)
      .forUpdate()
      .first();
    return query.findOne(withTransaction(trx, {
      where: { documentId: candidate.documentId },
    }));
  }

  async function resolvePaymentSubject(input: any, context: { trx: any; now: Date }) {
    let subject;
    let checkout = null;
    let authoritativeInput = input;
    if (input.subjectType === "membership") {
      subject = await lockDocument(
          "api::membership.membership",
          "memberships",
          input.subjectId,
          context.trx,
        );
    } else {
      const locked = await lockAuthoritativeOrderSubject({
        findOrder: (documentId: string) =>
          strapi.db.query(uid.order).findOne(withTransaction(context.trx, {
            where: { documentId },
          })),
        lockCheckout: (reference: string) => lockCheckout(reference, context.trx),
        lockOrder: (documentId: string) =>
          lockDocument(uid.order, "orders", documentId, context.trx),
      }, {
        orderDocumentId: input.subjectId,
        customerDocumentId: input.customerDocumentId,
        callerCheckoutReference: input.checkoutReference,
        now: context.now,
      });
      subject = locked.order;
      checkout = locked.checkout;
      if (locked.checkoutReference) {
        authoritativeInput = {
          ...input,
          checkoutReference: locked.checkoutReference,
          membershipDocumentId: locked.order.membershipDocumentId,
        };
      }
    }
    const reservationToken = paymentSubjectReservationToken(
      input,
      subject,
      checkout,
    );
    const reservation = reservationToken
      ? await lockReservation(reservationToken, context.trx)
      : null;
    if (input.subjectType === "order" &&
        process.env.SHIPPING_ENABLED === "true") {
      await (
        strapi.service("api::shipping-operations.shipping-quote") as any
      ).validateLockedSubject({
        order: subject,
        checkout,
        now: context.now,
        trx: context.trx,
      });
    }
    const resolved = deriveAuthoritativePaymentSubject(
      authoritativeInput,
      subject,
      reservation,
      context.now,
      checkout,
    );
    if (input.affiliateCode && process.env.AFFILIATES_ENABLED === "true") {
      const attribution = await (
        strapi.service("api::affiliate-operations.affiliate-operations") as any
      ).attributionForCode(input.affiliateCode, "code");
      if (attribution) {
        resolved.priceSnapshot = {
          ...(resolved.priceSnapshot ?? {}),
          affiliateAttribution: attribution,
        };
      }
    }
    return resolved;
  }

  async function validateSettlementSubject(
    payment: any,
    context: { trx: any; occurredAt: string; validatedAt: string },
  ) {
    const input = {
      subjectType: payment.subjectType,
      subjectId: payment.subjectId,
      purpose: payment.purpose,
      customerDocumentId: payment.customerDocumentId,
      membershipDocumentId: payment.membershipDocumentId,
      currency: payment.currency,
      ...(payment.priceSnapshot?.membershipCheckout?.checkoutReference
        ? {
            checkoutReference:
              payment.priceSnapshot.membershipCheckout.checkoutReference,
          }
        : {}),
      ...(payment.priceSnapshot?.affiliateAttribution?.affiliateCode
        ? {
            affiliateCode:
              payment.priceSnapshot.affiliateAttribution.affiliateCode,
          }
        : {}),
      ...(!payment.customerDocumentId && payment.ownerDocumentId?.startsWith("guest:")
        ? { guestCheckoutCapability: payment.ownerDocumentId.slice("guest:".length) }
        : {}),
    };
    const resolved = await resolvePaymentSubject(input, {
      trx: context.trx,
      now: new Date(context.validatedAt),
    });
    assertAuthoritativePaymentSubjectBinding(payment, resolved);
  }

  async function settleOrdinaryOrder(payment: any, trx: any) {
    const query = (uidValue: string) => strapi.db.query(uidValue);
    if (payment.membershipDocumentId || payment.priceSnapshot?.membershipCheckout) {
      const order = await lockDocument(uid.order, "orders", payment.orderDocumentId, trx);
      assertOrderPaymentBinding(order, payment);
      const marker = order?.priceSnapshot?.membershipCheckout;
      if (!marker ||
          marker.checkoutReference !== payment.priceSnapshot?.membershipCheckout?.checkoutReference ||
          order.membershipDocumentId !== payment.membershipDocumentId ||
          order.checkoutReference !== marker.checkoutReference) {
        throw new Error("Membership payment order binding is invalid.");
      }
      return query(uid.order).update(withTransaction(trx, {
        where: { documentId: order.documentId },
        data: {
          status: "paid",
          paymentDocumentId: payment.documentId,
        },
      }));
    }

    async function consumeOrderReservation(
      token: string,
      orderNumber: string,
      orderItems: any[],
    ) {
      const reservationQuery = query(uid.reservation);
      const candidate = await reservationQuery.findOne(withTransaction(trx, {
        where: { token },
      }));
      if (!candidate) throw new Error("Payment order reservation is unavailable.");
      await strapi.db.connection("stock_reservations")
        .where({ document_id: candidate.documentId })
        .transacting(trx)
        .forUpdate()
        .first();
      const reservation = await reservationQuery.findOne(withTransaction(trx, {
        where: { documentId: candidate.documentId },
      }));
      if (!reservation || reservation.status !== "reserved") {
        throw new Error("Payment order reservation cannot be consumed.");
      }
      const allocations = Array.isArray(reservation.allocations)
        ? [...reservation.allocations]
        : [];
      if (allocations.length === 0) {
        throw new Error("Payment order reservation allocation is invalid.");
      }
      assertReservationAllocationBinding(allocations, orderItems);
      assertReservationProductBinding(allocations, orderItems);
      allocations.sort((left, right) =>
        String(left?.batchDocumentId ?? "").localeCompare(
          String(right?.batchDocumentId ?? ""),
        ));
      for (const allocation of allocations) {
        const batchDocumentId = String(allocation?.batchDocumentId ?? "");
        const quantity = Number(allocation?.qty);
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
          throw new Error("Payment order reservation allocation is invalid.");
        }
        if (!batchDocumentId) {
          if (
            allocation?.batchNumber !== "LEGACY-STOCK"
            || typeof allocation?.slug !== "string"
            || !allocation.slug
          ) {
            throw new Error("Payment order reservation allocation is invalid.");
          }
          continue;
        }
        await strapi.db.connection("inventory_batches")
          .where({ document_id: batchDocumentId })
          .transacting(trx)
          .forUpdate()
          .first();
        const batchQuery = query(uid.batch);
        const batch = await batchQuery.findOne(withTransaction(trx, {
          where: { documentId: batchDocumentId },
        }));
        if (
          !batch
          || batch.productDocumentId !== allocation.productDocumentId
          || batch.slug !== allocation.slug
          || !Number.isSafeInteger(batch.quantity)
          || !Number.isSafeInteger(batch.reservedQuantity)
          || batch.quantity < quantity
          || batch.reservedQuantity < quantity
        ) {
          throw new Error("Payment order reserved inventory is unavailable.");
        }
        const balanceAfter = batch.quantity - quantity;
        await batchQuery.update(withTransaction(trx, {
          where: { documentId: batchDocumentId },
          data: {
            quantity: balanceAfter,
            reservedQuantity: batch.reservedQuantity - quantity,
            status: balanceAfter === 0 ? "depleted" : batch.status,
          },
        }));
      }
      await reservationQuery.update(withTransaction(trx, {
        where: { documentId: reservation.documentId },
        data: { status: "consumed", orderNumber },
      }));
      return allocations;
    }

    async function decrementOrderProducts(allocations: any[], reference: string) {
      const quantities = new Map<string, { slug: string; quantity: number }>();
      for (const allocation of allocations) {
        const productDocumentId =
          typeof allocation?.productDocumentId === "string"
            ? allocation.productDocumentId.trim()
            : "";
        const slug = typeof allocation?.slug === "string"
          ? allocation.slug.trim()
          : "";
        const quantity = Number(allocation?.qty);
        if (!productDocumentId || !slug ||
            !Number.isSafeInteger(quantity) || quantity <= 0) {
          throw new Error("Payment order inventory item is invalid.");
        }
        const current = quantities.get(productDocumentId);
        if (current && current.slug !== slug) {
          throw new Error("Payment order inventory product binding is invalid.");
        }
        const total = (current?.quantity ?? 0) + quantity;
        if (!Number.isSafeInteger(total)) {
          throw new Error("Payment order inventory quantity is invalid.");
        }
        quantities.set(productDocumentId, { slug, quantity: total });
      }
      for (const [productDocumentId, binding] of [...quantities].sort(([left], [right]) =>
        left.localeCompare(right))) {
        const { slug, quantity } = binding;
        const productQuery = query(uid.product);
        const candidate = await productQuery.findOne(withTransaction(trx, {
          where: { documentId: productDocumentId },
        }));
        if (!candidate?.documentId || candidate.slug !== slug) {
          throw new Error(`Payment order product ${slug} is unavailable.`);
        }
        await strapi.db.connection("products")
          .where({ document_id: productDocumentId })
          .transacting(trx)
          .forUpdate();
        const product = await productQuery.findOne(withTransaction(trx, {
          where: { documentId: productDocumentId },
        }));
        if (!product || product.slug !== slug ||
            !Number.isSafeInteger(product.stock) || product.stock < quantity) {
          throw new Error(`Payment order product ${slug} has insufficient stock.`);
        }
        const balanceAfter = product.stock - quantity;
        await productQuery.update(withTransaction(trx, {
          where: { documentId: product.documentId },
          data: { stock: balanceAfter },
        }));
        await query(uid.movement).create(withTransaction(trx, {
          data: {
            productDocumentId: product.documentId,
            productName: product.name || slug,
            sku: product.sku || "",
            slug,
            delta: -quantity,
            balanceAfter,
            reason: "sale",
            reference,
            actor: "Payment",
          },
        }));
      }
    }

    async function incrementPromotionUse(code: string) {
      const promotionQuery = query(uid.promotion);
      const candidate = await promotionQuery.findOne(withTransaction(trx, {
        where: { code },
      }));
      if (!candidate?.documentId) {
        throw new Error("Payment order promotion is unavailable.");
      }
      await strapi.db.connection("promotions")
        .where({ document_id: candidate.documentId })
        .transacting(trx)
        .forUpdate()
        .first();
      const promotion = await promotionQuery.findOne(withTransaction(trx, {
        where: { documentId: candidate.documentId },
      }));
      if (!promotion) {
        throw new Error("Payment order promotion is unavailable.");
      }
      await promotionQuery.update(withTransaction(trx, {
        where: { documentId: promotion.documentId },
        data: { usageCount: nextPromotionUsage(promotion) },
      }));
    }

    return settleOrdinaryOrderTransaction({
      lockOrder: (documentId: string) =>
        lockDocument(uid.order, "orders", documentId, trx),
      assertBinding: (order: any, currentPayment: any) =>
        assertOrderPaymentBinding(order, currentPayment),
      consumeReservation: consumeOrderReservation,
      decrementProductStock: decrementOrderProducts,
      incrementPromotionUse,
      updateOrder: (documentId: string, data: any) =>
        query(uid.order).update(withTransaction(trx, {
          where: { documentId },
          data,
        })),
    }, payment);
  }

  const settleSubject = createPaymentSubjectSettlement({
    activateMembership: (input: any) => (
      strapi.service("api::membership-operations.membership-operations") as any
    ).activateMembership(input),
    finalizeMembershipCheckout: (input: any) => (
      strapi.service("api::membership-operations.membership-operations") as any
    ).finalizeMembershipCheckout(input),
    settleOrder: (payment: any, context: { trx?: any }) =>
      settleOrdinaryOrder(payment, context.trx),
  });
  const settleSubjectWithAffiliate = async (payment: any, context: any) => {
    const result = await settleSubject(payment, context);
    await (
      strapi.service("api::affiliate-operations.affiliate-operations") as any
    ).createCommissionForPayment(payment, {
      occurredAt: payment.paidAt,
      trx: context?.trx,
    });
    return result;
  };

  const adapter = createStrapiPaymentAdapter(strapi, {
    resolvePaymentSubject,
    validateSettlementSubject,
    settleSubject: settleSubjectWithAffiliate,
  });
  const operations = (beneficiary: any = {}) =>
    createPaymentTransactions(adapter, { env: process.env, beneficiary });
  const ropayAuthenticatedLimiter = createRoPayAuthenticatedLimiter({
    limit: process.env.ROPAY_AUTH_RATE_LIMIT,
    replayLimit: process.env.ROPAY_AUTH_REPLAY_LIMIT,
    windowMs: process.env.ROPAY_AUTH_RATE_WINDOW_MS,
    maxBuckets: process.env.ROPAY_AUTH_RATE_MAX_BUCKETS,
  });

  async function listAdminPayments() {
    assertPaymentsEnabled();
    const payments = await strapi.db.query(uid.payment).findMany({
      orderBy: { createdAt: "desc" },
      limit: 100,
      select: [
        "documentId", "paymentReference", "purpose", "method", "amountMinor", "currency",
        "receivedAmountMinor", "receivedCurrency", "receivedAt", "status", "expiresAt",
        "customerDocumentId", "orderDocumentId", "membershipDocumentId",
      ],
    } as any);
    const paymentDocumentIds = payments.map((payment: any) => payment.documentId);
    const events = paymentDocumentIds.length === 0
      ? []
      : await strapi.db.query("api::payment-event.payment-event").findMany({
          where: { paymentDocumentId: { $in: paymentDocumentIds } },
          orderBy: { occurredAt: "desc" },
          limit: 1000,
          select: ["eventId", "paymentDocumentId", "transition", "actor", "reason", "occurredAt"],
        } as any);
    return projectAdminPayments(payments, events);
  }

  return {
    listAdminPayments,
    async readPaymentStatus(input: any) {
      assertPaymentsEnabled();
      const payment = await strapi.db.query(uid.payment).findOne({
        where: { paymentReference: input.paymentReference },
      });
      return authorizePaymentStatus(payment, {
        customerDocumentId: input.customerDocumentId,
        guestCheckoutCapability: input.guestCheckoutCapability,
      });
    },
    async prepareBankTransfer(input: any) {
      assertPaymentsEnabled();
      return withPaymentWriteAccess(() =>
        operations(beneficiaryFromEnv(process.env)).prepareBankTransfer(input));
    },
    recordBankReceipt(input: any) {
      assertPaymentsEnabled();
      return withPaymentWriteAccess(() => operations().recordBankReceipt(input));
    },
    resolvePaymentMismatch(input: any) {
      assertPaymentsEnabled();
      return withPaymentWriteAccess(() => operations().resolvePaymentMismatch(input));
    },
    expireDuePayments(now = new Date(), limit = 100) {
      assertPaymentsEnabled();
      return withPaymentWriteAccess(() => operations().expireDuePayments(now, limit));
    },
    settlePayment(input: any) {
      assertPaymentsEnabled();
      return withPaymentWriteAccess(() => operations().settlePayment(input));
    },
    createRoPayIntent(input: any) {
      assertRoPayEnabled();
      return withPaymentWriteAccess(() =>
        createRoPayIntent(adapter, input, { env: process.env }));
    },
    verifyRoPayCallback(input: any) {
      assertRoPayEnabled();
      return verifyRoPayCallback(input, {
        secret: process.env.ROPAY_CALLBACK_SECRET,
        now: new Date(),
      });
    },
    handleRoPayCallback(input: any) {
      assertRoPayEnabled();
      return withPaymentWriteAccess(() =>
        handleRoPayCallback(adapter, input, {
          env: process.env,
          now: () => new Date(),
          authenticatedLimiter: ropayAuthenticatedLimiter,
        }));
    },
    verifyRoPayStatus(input: any) {
      assertRoPayEnabled();
      verifyRoPayStatus(input, {
        secret: process.env.ROPAY_CALLBACK_SECRET,
        now: new Date(),
      });
      return withPaymentWriteAccess(() =>
        handleRoPayCallback(adapter, input, {
          env: process.env,
          now: () => new Date(),
          verification: "status",
          authenticatedLimiter: ropayAuthenticatedLimiter,
        }));
    },
    readRoPayStatus(input: any) {
      assertRoPayEnabled();
      return readRoPayStatus(adapter, input, { env: process.env });
    },
  } as any;
});
