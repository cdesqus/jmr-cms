import assert from "node:assert/strict";
import test from "node:test";
import {
  affiliateAttributionSnapshot,
  commissionForPaidPayment,
  normaliseAffiliateCode,
} from "./affiliate-domain.cjs";

test("normalises affiliate codes for links and promotion codes", () => {
  assert.equal(normaliseAffiliateCode(" joni 10 "), "JONI10");
  assert.equal(normaliseAffiliateCode("jo-ni_10"), "JO-NI_10");
  assert.throws(() => normaliseAffiliateCode("x"), /affiliate code/i);
  assert.throws(() => normaliseAffiliateCode("bad/code"), /affiliate code/i);
});

test("creates an immutable attribution snapshot from an active affiliate", () => {
  assert.deepEqual(affiliateAttributionSnapshot({
    documentId: "aff-1",
    name: "Joni",
    code: "joni10",
    discountType: "percentage",
    discountValue: 10,
    commissionRateBps: 1500,
    active: true,
  }, {
    source: "code",
    landingPage: "/shop",
    attributedAt: "2026-07-30T10:00:00.000Z",
  }), {
    affiliateDocumentId: "aff-1",
    affiliateName: "Joni",
    affiliateCode: "JONI10",
    source: "code",
    landingPage: "/shop",
    discountType: "percentage",
    discountValue: 10,
    commissionRateBps: 1500,
    attributedAt: "2026-07-30T10:00:00.000Z",
  });
  assert.equal(affiliateAttributionSnapshot({ code: "OFF", active: false }), null);
});

test("creates pending commission for paid ordinary order excluding shipping", () => {
  assert.deepEqual(commissionForPaidPayment({
    documentId: "pay-1",
    status: "paid",
    purpose: "order",
    orderDocumentId: "order-1",
    amountMinor: 12_000,
    currency: "EUR",
    priceSnapshot: {
      subtotalCents: 10_000,
      discountCents: 1_000,
      shippingCents: 2_000,
    },
  }, {
    affiliateDocumentId: "aff-1",
    affiliateCode: "JONI10",
    commissionRateBps: 1500,
  }, { occurredAt: "2026-07-30T10:00:00.000Z" }), {
    affiliateDocumentId: "aff-1",
    affiliateCode: "JONI10",
    paymentDocumentId: "pay-1",
    orderDocumentId: "order-1",
    membershipDocumentId: "",
    subjectType: "order",
    purpose: "order",
    status: "pending",
    eligibleAmountMinor: 9000,
    commissionRateBps: 1500,
    commissionAmountMinor: 1350,
    currency: "EUR",
    sourceSnapshot: {
      affiliateDocumentId: "aff-1",
      affiliateCode: "JONI10",
      commissionRateBps: 1500,
    },
    occurredAt: "2026-07-30T10:00:00.000Z",
  });
});

test("creates pending commission for paid membership purchase and renewal", () => {
  const commission = commissionForPaidPayment({
    documentId: "pay-2",
    status: "paid",
    purpose: "membership_purchase",
    membershipDocumentId: "mem-1",
    amountMinor: 30_000,
    currency: "EUR",
  }, {
    affiliateDocumentId: "aff-1",
    affiliateCode: "JONI10",
    commissionRateBps: 1200,
  }, { occurredAt: "2026-07-30T10:00:00.000Z" });
  assert.equal(commission.subjectType, "membership");
  assert.equal(commission.eligibleAmountMinor, 30000);
  assert.equal(commission.commissionAmountMinor, 3600);
});

test("does not create commission for unpaid payments or missing attribution", () => {
  assert.equal(commissionForPaidPayment({ status: "awaiting_payment" }, { affiliateDocumentId: "aff-1" }), null);
  assert.equal(commissionForPaidPayment({ status: "paid" }, null), null);
});
