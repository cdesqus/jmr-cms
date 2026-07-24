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
import { purchasePaymentReference } from "./membership-purchase-key.cjs";

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

  return {
    ...transactions,
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
      const plan = await documents(uid.plan).findOne({ documentId: planDocumentId });
      if (!plan?.active) throw new Error("Membership plan not found.");
      if (renewalOf) {
        const previous = await findMembership(renewalOf);
        if (!previous || previous.customerDocumentId !== customerDocumentId) throw new Error("Membership not found.");
      }
      const paymentDocumentId = purchasePaymentReference(customerDocumentId, idempotencyKey);
      const existing = await documents(uid.membership).findMany({
        filters: { paymentDocumentId: { $eq: paymentDocumentId } },
        limit: 1,
      });
      if (existing[0]) {
        if (existing[0].customerDocumentId !== customerDocumentId || existing[0].planDocumentId !== planDocumentId) {
          throw new Error("Membership purchase conflict.");
        }
        const activation = await confirmation.confirm({ membershipId: existing[0].documentId, paymentDocumentId });
        return { membership: activation.membership, paymentDocumentId, mockConfirmed: true };
      }
      const membershipNumber = `MEM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const membership = await documents(uid.membership).create({
        data: {
          membershipNumber,
          customerDocumentId,
          planDocumentId,
          planSnapshot: {
            name: plan.name,
            durationMonths: Number(plan.durationMonths),
            packageCredits: plan.packageCredits,
            eligibleProductSlugs: plan.eligibleProductSlugs,
            priceEurMinor: plan.priceEurMinor,
            priceRonMinor: plan.priceRonMinor,
          },
          status: "pending_payment",
          paymentDocumentId,
          cachedRemainingCredits: 0,
        },
      });
      const activation = await confirmation.confirm({ membershipId: membership.documentId, paymentDocumentId });
      return { membership: activation.membership, paymentDocumentId, mockConfirmed: true };
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
