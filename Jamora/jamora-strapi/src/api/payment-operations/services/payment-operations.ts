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
} from "./payment-transaction.cjs";
const { withPaymentWriteAccess } = require(
  "../../payment/content-types/payment/payment-write-guard.cjs",
);

const uid = {
  payment: "api::payment.payment",
  order: "api::order.order",
  reservation: "api::stock-reservation.stock-reservation",
  checkout: "api::membership-checkout.membership-checkout",
};

export default factories.createCoreService(uid.payment as any, ({ strapi }) => {
  function assertPaymentsEnabled() {
    if (process.env.PAYMENTS_ENABLED !== "true") throw new Error("Not found.");
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
    const reservation = input.guestCheckoutCapability
      ? await lockReservation(input.guestCheckoutCapability, context.trx)
      : null;
    return deriveAuthoritativePaymentSubject(
      authoritativeInput,
      subject,
      reservation,
      context.now,
      checkout,
    );
  }

  async function validateSettlementSubject(
    payment: any,
    context: { trx: any; occurredAt: string },
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
      ...(!payment.customerDocumentId && payment.ownerDocumentId?.startsWith("guest:")
        ? { guestCheckoutCapability: payment.ownerDocumentId.slice("guest:".length) }
        : {}),
    };
    const resolved = await resolvePaymentSubject(input, {
      trx: context.trx,
      now: new Date(context.occurredAt),
    });
    assertAuthoritativePaymentSubjectBinding(payment, resolved);
  }

  async function settleOrdinaryOrder(payment: any, trx: any) {
    const documentId = payment.orderDocumentId || payment.subjectId;
    await strapi.db.connection("orders")
      .where({ document_id: documentId })
      .transacting(trx)
      .forUpdate()
      .first();
    const orderQuery = strapi.db.query(uid.order);
    const order = await orderQuery.findOne({
      where: { documentId },
      transacting: trx,
    } as any);
    if (!order) throw new Error("Payment order not found.");
    assertOrderPaymentBinding(order, payment);
    if (order.status === "paid" && order.paymentDocumentId === payment.documentId) {
      return { order, idempotent: true };
    }
    if (order.status !== "pending") throw new Error("Payment order is not pending.");
    const statusHistory = Array.isArray(order.statusHistory)
      ? [...order.statusHistory]
      : [];
    statusHistory.push({
      type: "status",
      status: "paid",
      note: "Payment confirmed by bank transfer reconciliation.",
      actor: "Payment",
      at: payment.paidAt,
    });
    const updated = await orderQuery.update({
      where: { documentId },
      data: {
        status: "paid",
        paymentDocumentId: payment.documentId,
        statusHistory,
      },
      transacting: trx,
    } as any);
    return { order: updated, idempotent: false };
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

  const adapter = createStrapiPaymentAdapter(strapi, {
    resolvePaymentSubject,
    validateSettlementSubject,
    settleSubject,
  });
  const operations = (beneficiary: any = {}) =>
    createPaymentTransactions(adapter, { env: process.env, beneficiary });

  return {
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
  } as any;
});
