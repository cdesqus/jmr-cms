"use strict";

function normaliseAffiliateCode(value) {
  if (typeof value !== "string") throw new TypeError("Affiliate code is required.");
  const code = value.trim().replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new TypeError("Affiliate code must be 3-32 letters, numbers, dashes, or underscores.");
  }
  return code;
}

function positiveInteger(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function affiliateAttributionSnapshot(affiliate, source = {}) {
  if (!affiliate?.active) return null;
  const commissionRateBps = positiveInteger(affiliate.commissionRateBps);
  if (commissionRateBps <= 0 || commissionRateBps > 10000) return null;
  return {
    affiliateDocumentId: String(affiliate.documentId ?? ""),
    affiliateName: String(affiliate.name ?? ""),
    affiliateCode: normaliseAffiliateCode(affiliate.code),
    source: source.source === "link" ? "link" : "code",
    landingPage: typeof source.landingPage === "string" ? source.landingPage.slice(0, 500) : "",
    discountType: affiliate.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: positiveInteger(affiliate.discountValue),
    commissionRateBps,
    attributedAt: source.attributedAt ?? new Date().toISOString(),
  };
}

function eligibleOrderAmount(payment) {
  const snapshot = payment?.priceSnapshot ?? {};
  const subtotal = positiveInteger(snapshot.subtotalCents ?? snapshot.subtotalMinor ?? snapshot.merchandiseMinor ?? payment.amountMinor);
  const discount = positiveInteger(snapshot.discountCents ?? snapshot.discountMinor, 0);
  return Math.max(0, subtotal - discount);
}

function commissionForPaidPayment(payment, attribution, options = {}) {
  if (!payment || payment.status !== "paid" || !attribution?.affiliateDocumentId) return null;
  const purpose = payment.purpose ?? "";
  const isMembership = purpose === "membership_purchase" || purpose === "membership_renewal";
  const isOrder = purpose === "order";
  if (!isMembership && !isOrder) return null;
  const rate = positiveInteger(attribution.commissionRateBps);
  if (rate <= 0 || rate > 10000) return null;
  const eligibleAmountMinor = isMembership
    ? positiveInteger(payment.amountMinor)
    : eligibleOrderAmount(payment);
  if (eligibleAmountMinor <= 0) return null;
  return {
    affiliateDocumentId: attribution.affiliateDocumentId,
    affiliateCode: normaliseAffiliateCode(attribution.affiliateCode),
    paymentDocumentId: payment.documentId,
    orderDocumentId: payment.orderDocumentId ?? "",
    membershipDocumentId: payment.membershipDocumentId ?? "",
    subjectType: isMembership ? "membership" : "order",
    purpose,
    status: "pending",
    eligibleAmountMinor,
    commissionRateBps: rate,
    commissionAmountMinor: Math.floor((eligibleAmountMinor * rate) / 10000),
    currency: String(payment.currency ?? "EUR").toUpperCase(),
    sourceSnapshot: structuredClone(attribution),
    occurredAt: options.occurredAt ?? payment.paidAt ?? new Date().toISOString(),
  };
}

module.exports = {
  affiliateAttributionSnapshot,
  commissionForPaidPayment,
  normaliseAffiliateCode,
};
