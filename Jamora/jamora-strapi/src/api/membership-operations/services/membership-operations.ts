import { factories } from "@strapi/strapi";
import {
  createMembershipTransactions,
  createStrapiMembershipAdapter,
} from "./membership-transaction.cjs";
import { createPhase1MembershipConfirmation } from "./phase1-membership-confirmation.cjs";
import { normalisePlan } from "./membership-domain.cjs";
import {
  assertMembershipEnabled,
  mergePlanPatch,
} from "./membership-service-contract.cjs";
import { listAdminMemberships } from "./membership-admin-projection.cjs";
import { listCustomerMemberships } from "./membership-customer-projection.cjs";
import { prepareMembershipPurchase } from "./membership-purchase.cjs";

const uid = {
  plan: "api::membership-plan.membership-plan",
  membership: "api::membership.membership",
  ledger: "api::membership-credit-entry.membership-credit-entry",
};

export default factories.createCoreService(uid.membership as any, ({ strapi }) => {
  const documents = (name: string) => (strapi.documents as any)(name);
  const transactions = createMembershipTransactions(createStrapiMembershipAdapter(strapi));
  const confirmation = createPhase1MembershipConfirmation(transactions.activateMembership);

  async function findMembership(documentId: string) {
    return documents(uid.membership).findOne({ documentId });
  }

  async function releaseCheckoutStock(input: any) {
    assertMembershipEnabled();
    if (!input.reservationToken || !input.checkoutReference || !input.idempotencyKey) {
      throw new Error("Invalid stock compensation request.");
    }
    const reservations = await documents("api::stock-reservation.stock-reservation").findMany({
      filters: { token: { $eq: input.reservationToken } },
      limit: 1,
    });
    const reservation = reservations[0];
    if (!reservation) throw new Error("Stock reservation not found.");
    const targetStatus = input.consumed ? "consumed" : "reserved";
    if (reservation.status === "released") return { reservation, idempotent: true };
    if (reservation.status !== targetStatus) throw new Error("Stock reservation cannot be compensated.");
    const allocations = Array.isArray(reservation.allocations) ? reservation.allocations : [];
    await strapi.db.transaction(async () => {
      for (const allocation of allocations) {
        if (!allocation.batchDocumentId) continue;
        const batch = await documents("api::inventory-batch.inventory-batch")
          .findOne({ documentId: allocation.batchDocumentId });
        if (!batch) throw new Error("Reserved inventory batch not found.");
        const qty = Number(allocation.qty);
        if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error("Invalid stock reservation.");
        await documents("api::inventory-batch.inventory-batch").update({
          documentId: batch.documentId,
          data: input.consumed
            ? {
                quantity: Number(batch.quantity) + qty,
                status: batch.status === "depleted" ? "active" : batch.status,
              }
            : {
                reservedQuantity: Math.max(0, Number(batch.reservedQuantity) - qty),
              },
        });
      }
      await documents("api::stock-reservation.stock-reservation").update({
        documentId: reservation.documentId,
        data: { status: "released" },
      });
    });
    return { reservationToken: input.reservationToken, status: "released", idempotent: false };
  }

  async function redeemCheckout(input: any) {
    assertMembershipEnabled();
    for (const [name, value] of Object.entries({
      credits: input.credits,
      coveredMerchandiseMinor: input.coveredMerchandiseMinor,
      shippingMinor: input.shippingMinor,
    })) {
      if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${name} must be a positive safe integer.`);
    }
    const order = await documents("api::order.order").findOne({ documentId: input.orderId });
    if (!order || order.status !== "paid") throw new Error("Paid membership order not found.");
    const membershipSnapshot = {
      membershipDocumentId: input.membershipId,
      checkoutReference: input.checkoutReference,
      creditsRedeemed: input.credits,
      coveredMerchandiseMinor: input.coveredMerchandiseMinor,
      merchandiseMinor: 0,
      shippingMinor: input.shippingMinor,
    };
    await documents("api::order.order").update({
      documentId: input.orderId,
      data: {
        membershipDocumentId: input.membershipId,
        membershipSnapshot,
        subtotalCents: 0,
        shippingCents: input.shippingMinor,
        discountCents: 0,
        totalCents: input.shippingMinor,
      },
    });
    try {
      return await transactions.redeemCredits(input);
    } catch (error) {
      await documents("api::order.order").update({
        documentId: input.orderId,
        data: { membershipDocumentId: null, membershipSnapshot: null },
      });
      throw error;
    }
  }

  return {
    ...transactions,
    releaseCheckoutStock,
    redeemCheckout,
    listPlans(activeOnly = false) {
      assertMembershipEnabled();
      return documents(uid.plan).findMany({
        filters: activeOnly ? { active: { $eq: true } } : {},
        sort: { durationMonths: "asc" },
        limit: 100,
      });
    },
    createPlan(input: any) {
      assertMembershipEnabled();
      return documents(uid.plan).create({ data: normalisePlan(input) });
    },
    async updatePlan(documentId: string, input: any) {
      assertMembershipEnabled();
      const existing = await documents(uid.plan).findOne({ documentId });
      return documents(uid.plan).update({
        documentId,
        data: mergePlanPatch(existing, input),
      });
    },
    async listMemberships() {
      assertMembershipEnabled();
      return listAdminMemberships({
        findMemberships: (query: any) => documents(uid.membership).findMany(query),
        findEntries: (query: any) => documents(uid.ledger).findMany(query),
      });
    },
    customerMemberships(customerDocumentId: string) {
      assertMembershipEnabled();
      return listCustomerMemberships({
        findMemberships: (query: any) => documents(uid.membership).findMany(query),
        findEntries: (query: any) => documents(uid.ledger).findMany(query),
      }, customerDocumentId);
    },
    async preparePurchase(customerDocumentId: string, planDocumentId: string, idempotencyKey: string, renewalOf?: string) {
      assertMembershipEnabled();
      return prepareMembershipPurchase({
        findPlan: (documentId: string) => documents(uid.plan).findOne({ documentId }),
        findMembership,
        async findByPaymentReference(paymentDocumentId: string) {
          const rows = await documents(uid.membership).findMany({
            filters: { paymentDocumentId: { $eq: paymentDocumentId } },
            limit: 1,
          });
          return rows[0] ?? null;
        },
        createMembership: (data: any) => documents(uid.membership).create({ data }),
        confirm: confirmation.confirm,
        randomUUID: () => crypto.randomUUID(),
      }, {
        customerDocumentId,
        planDocumentId,
        operation: renewalOf ? "renew" : "purchase",
        idempotencyKey,
        renewalOf,
      });
    },
    async expireDueMemberships(now = new Date(), limit = 100) {
      assertMembershipEnabled();
      const due = await documents(uid.membership).findMany({
        filters: { status: { $eq: "active" }, endsAt: { $lte: now.toISOString() } },
        fields: ["documentId"],
        sort: { endsAt: "asc" },
        limit: Math.min(Math.max(limit, 1), 100),
      });
      let count = 0;
      for (const membership of due) {
        await transactions.expireMembership({
          membershipId: membership.documentId,
          now,
          idempotencyKey: `expiry:${membership.documentId}`,
        });
        count += 1;
      }
      return count;
    },
  } as any;
});
