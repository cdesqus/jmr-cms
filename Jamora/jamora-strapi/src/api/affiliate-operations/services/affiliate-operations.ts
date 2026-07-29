import { factories } from "@strapi/strapi";
const {
  affiliateAttributionSnapshot,
  commissionForPaidPayment,
  normaliseAffiliateCode,
} = require("./affiliate-domain.cjs");

const uid = {
  affiliate: "api::affiliate.affiliate",
  commission: "api::affiliate-commission.affiliate-commission",
};

export default factories.createCoreService(uid.affiliate as any, ({ strapi }) => {
  function assertEnabled() {
    if (process.env.AFFILIATES_ENABLED !== "true") throw new Error("Not found.");
  }

  async function findAffiliateByCode(code: string) {
    const normalised = normaliseAffiliateCode(code);
    const rows = await (strapi.documents as any)(uid.affiliate).findMany({
      filters: { code: { $eqi: normalised }, active: true },
      limit: 1,
    });
    return rows[0] ?? null;
  }

  async function listAdminAffiliates() {
    assertEnabled();
    const [affiliates, commissions] = await Promise.all([
      (strapi.documents as any)(uid.affiliate).findMany({
        sort: { createdAt: "desc" },
        limit: 100,
      }),
      (strapi.documents as any)(uid.commission).findMany({
        sort: { occurredAt: "desc" },
        limit: 1000,
      }),
    ]);
    return affiliates.map((affiliate: any) => {
      const own = commissions.filter((commission: any) =>
        commission.affiliateDocumentId === affiliate.documentId);
      const sum = (status: string) => own
        .filter((commission: any) => commission.status === status)
        .reduce((total: number, commission: any) =>
          total + Number(commission.commissionAmountMinor ?? 0), 0);
      return {
        ...affiliate,
        pendingCommissionMinor: sum("pending"),
        approvedCommissionMinor: sum("approved"),
        paidCommissionMinor: sum("paid"),
        commissionCount: own.length,
      };
    });
  }

  async function createAffiliate(input: any) {
    assertEnabled();
    const data = {
      name: String(input?.name ?? "").trim(),
      email: String(input?.email ?? "").trim() || undefined,
      code: normaliseAffiliateCode(input?.code),
      discountType: input?.discountType === "fixed" ? "fixed" : "percentage",
      discountValue: Math.max(0, Math.round(Number(input?.discountValue ?? 10))),
      commissionRateBps: Math.max(0, Math.round(Number(input?.commissionRateBps ?? 1500))),
      active: input?.active !== false,
    };
    if (!data.name) throw new Error("Affiliate name is required.");
    return (strapi.documents as any)(uid.affiliate).create({ data });
  }

  async function recordClick(input: any) {
    assertEnabled();
    const affiliate = await findAffiliateByCode(input?.code);
    if (!affiliate) return null;
    await (strapi.documents as any)(uid.affiliate).update({
      documentId: affiliate.documentId,
      data: { clickCount: Number(affiliate.clickCount ?? 0) + 1 },
    });
    return affiliateAttributionSnapshot(affiliate, {
      source: input?.source === "code" ? "code" : "link",
      landingPage: String(input?.landingPage ?? ""),
      attributedAt: new Date().toISOString(),
    });
  }

  async function attributionForCode(code: string, source = "code") {
    if (process.env.AFFILIATES_ENABLED !== "true") return null;
    const affiliate = await findAffiliateByCode(code);
    return affiliateAttributionSnapshot(affiliate, {
      source,
      attributedAt: new Date().toISOString(),
    });
  }

  async function createCommissionForPayment(payment: any, context: any = {}) {
    if (process.env.AFFILIATES_ENABLED !== "true") return null;
    const attribution =
      payment?.priceSnapshot?.affiliateAttribution ??
      payment?.affiliateAttributionSnapshot;
    const commission = commissionForPaidPayment(payment, attribution, {
      occurredAt: context.occurredAt ?? payment?.paidAt,
    });
    if (!commission) return null;
    const existing = await (strapi.documents as any)(uid.commission).findMany({
      filters: { paymentDocumentId: commission.paymentDocumentId },
      limit: 1,
    });
    if (existing[0]) return existing[0];
    const created = await (strapi.documents as any)(uid.commission).create({
      data: commission,
    });
    const affiliate = await (strapi.documents as any)(uid.affiliate).findOne({
      documentId: commission.affiliateDocumentId,
    }).catch(() => null);
    if (affiliate) {
      await (strapi.documents as any)(uid.affiliate).update({
        documentId: affiliate.documentId,
        data: { conversionCount: Number(affiliate.conversionCount ?? 0) + 1 },
      });
    }
    return created;
  }

  return {
    attributionForCode,
    createAffiliate,
    createCommissionForPayment,
    listAdminAffiliates,
    recordClick,
  } as any;
});
