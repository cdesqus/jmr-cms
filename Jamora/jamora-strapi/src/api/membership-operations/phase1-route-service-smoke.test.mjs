import assert from "node:assert/strict";
import test from "node:test";
import {
  createMembershipTransactions,
  createMemoryMembershipAdapter,
} from "./services/membership-transaction.cjs";
import {
  createMembershipCheckoutService,
  createMemoryMembershipCheckoutAdapter,
} from "./services/membership-checkout.cjs";
import { listCustomerMemberships } from "./services/membership-customer-projection.cjs";

const enabled = { MEMBERSHIP_ENABLED: "true" };
const now = new Date("2026-07-24T00:00:00.000Z");

function adminContext(body = {}, documentId) {
  const headers = {
    "x-jamora-admin-secret": "admin-secret",
    "x-jamora-admin-actor": "owner@example.test",
    "x-jamora-admin-role": "owner",
  };
  return {
    request: { body },
    params: { documentId },
    get: (name) => headers[name.toLowerCase()] ?? "",
  };
}

test("Phase 1 route and service fixture smoke", async () => {
  const previous = {
    enabled: process.env.MEMBERSHIP_ENABLED,
    secret: process.env.JAMORA_ADMIN_API_SECRET,
    strapi: globalThis.strapi,
  };
  const plans = new Map();
  const routeService = {
    listPlans: async () => [...plans.values()],
    createPlan: async (input) => {
      const plan = { documentId: "plan-1", ...input };
      plans.set(plan.documentId, plan);
      return plan;
    },
    updatePlan: async (documentId, input) => {
      const plan = { ...plans.get(documentId), ...input };
      plans.set(documentId, plan);
      return plan;
    },
  };
  globalThis.strapi = { service: () => routeService };

  try {
    process.env.JAMORA_ADMIN_API_SECRET = "admin-secret";
    delete process.env.MEMBERSHIP_ENABLED;
    const controller = (await import(`./controllers/membership-operations.ts?smoke=${Date.now()}`)).default;

    const disabled = adminContext();
    await controller.adminPlans(disabled);
    assert.equal(disabled.status, 404);
    assert.deepEqual(disabled.body, { error: "Not found." });

    process.env.MEMBERSHIP_ENABLED = "true";
    const create = adminContext({
      name: "Balance 3", active: true, durationMonths: 3,
      priceEurMinor: 6900, priceRonMinor: 34362, packageCredits: 3,
      eligibleProductSlugs: ["beras-kencur"],
    });
    await controller.createPlan(create);
    assert.equal(create.body.documentId, "plan-1");
    const update = adminContext({ packageCredits: 4 }, "plan-1");
    await controller.updatePlan(update);
    assert.equal(update.body.packageCredits, 4);
    const list = adminContext();
    await controller.adminPlans(list);
    assert.deepEqual(list.body.plans, [update.body]);

    const oldMembership = {
      documentId: "membership-old", customerDocumentId: "customer-1",
      status: "active", startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2027-01-01T00:00:00.000Z", cachedRemainingCredits: 99,
      planSnapshot: { name: "Balance 3", durationMonths: 3, packageCredits: 4 },
    };
    const renewal = {
      ...oldMembership, documentId: "membership-renewal", status: "pending_payment",
      startsAt: null, endsAt: null, cachedRemainingCredits: 0,
    };
    const membershipAdapter = createMemoryMembershipAdapter({
      memberships: [oldMembership, renewal],
      entries: [{
        entryId: "grant-old", idempotencyKey: "grant-old",
        membershipDocumentId: oldMembership.documentId, kind: "grant",
        credits: 4, actor: "payment", occurredAt: oldMembership.startsAt,
      }],
    });
    const transactions = createMembershipTransactions(membershipAdapter, enabled);

    await transactions.activateMembership({
      membershipId: renewal.documentId, paymentDocumentId: "mock-payment-1",
      now, idempotencyKey: "activate:renewal",
    });
    await transactions.activateMembership({
      membershipId: renewal.documentId, paymentDocumentId: "mock-payment-1",
      now, idempotencyKey: "activate:renewal",
    });
    assert.equal(membershipAdapter.entries.filter((entry) =>
      entry.kind === "grant" && entry.membershipDocumentId === renewal.documentId).length, 1);
    assert.equal(membershipAdapter.memberships.get(oldMembership.documentId).endsAt, oldMembership.endsAt);

    const dashboard = await listCustomerMemberships({
      findMemberships: async () => [membershipAdapter.memberships.get(oldMembership.documentId)],
      findEntries: async () => membershipAdapter.entries.filter((entry) =>
        entry.membershipDocumentId === oldMembership.documentId),
    }, "customer-1");
    assert.equal(dashboard[0].ledgerBalance, 4);

    await assert.rejects(() => transactions.adjustCredits({
      membershipId: oldMembership.documentId, creditDelta: 1, reason: " ",
      actor: "owner@example.test", idempotencyKey: "adjust:missing-reason",
    }), /reason is required/i);
    await transactions.adjustCredits({
      membershipId: oldMembership.documentId, creditDelta: 1,
      reason: "Service recovery", actor: "owner@example.test",
      idempotencyKey: "adjust:service-recovery",
    });
    assert.equal(membershipAdapter.entries.find((entry) =>
      entry.idempotencyKey === "adjust:service-recovery").reason, "Service recovery");

    const checkoutInput = {
      customerDocumentId: "customer-1",
      membershipDocumentId: oldMembership.documentId,
      checkoutReference: "24b83a32-68b1-4db2-a6ad-2a3740053282",
      idempotencyKey: "checkout:reserve",
      items: [{ slug: "beras-kencur", qty: 2 }],
      now,
    };
    const checkoutAdapter = createMemoryMembershipCheckoutAdapter({
      memberships: [{
        ...oldMembership, ledgerBalance: 5,
        eligibleProductSlugs: ["beras-kencur"],
      }],
      products: [{
        documentId: "product-1", slug: "beras-kencur",
        priceCents: 3000, creditCost: 1, stock: 2,
      }],
    });
    const checkout = createMembershipCheckoutService(checkoutAdapter, enabled);
    const reserved = await checkout.reserve(checkoutInput);
    assert.equal(checkoutAdapter.stock.get("product-1"), 0);
    assert.equal(checkoutAdapter.creditReservations.get(reserved.checkoutReference).credits, 2);
    const paid = await checkout.finalize({
      customerDocumentId: "customer-1",
      checkoutReference: reserved.checkoutReference,
      idempotencyKey: "checkout:paid",
      now: new Date("2026-07-24T00:05:00.000Z"),
    });
    assert.equal(paid.order.shippingCents, 495);
    assert.equal(paid.order.totalCents, 495);
    assert.equal(checkoutAdapter.creditReservations.get(reserved.checkoutReference).status, "redeemed");

    const failedAdapter = createMemoryMembershipCheckoutAdapter({
      memberships: [{
        ...oldMembership, ledgerBalance: 5,
        eligibleProductSlugs: ["beras-kencur"],
      }],
      products: [{
        documentId: "product-1", slug: "beras-kencur",
        priceCents: 3000, creditCost: 1, stock: 2,
      }],
      failCreateOrder: true,
    });
    const failedCheckout = createMembershipCheckoutService(failedAdapter, enabled);
    await failedCheckout.reserve({ ...checkoutInput, checkoutReference: "b6f254a2-55dc-4f2d-a82a-c5902f4a75cd" });
    await assert.rejects(() => failedCheckout.finalize({
      customerDocumentId: "customer-1",
      checkoutReference: "b6f254a2-55dc-4f2d-a82a-c5902f4a75cd",
      idempotencyKey: "checkout:failed",
      now: new Date("2026-07-24T00:05:00.000Z"),
    }), /creation failed/i);
    assert.equal(failedAdapter.stock.get("product-1"), 2);
    assert.equal(failedAdapter.creditReservations.get("b6f254a2-55dc-4f2d-a82a-c5902f4a75cd").status, "released");

    membershipAdapter.memberships.get(oldMembership.documentId).endsAt =
      "2026-07-01T00:00:00.000Z";
    await transactions.expireMembership({
      membershipId: oldMembership.documentId, now,
      idempotencyKey: `expiry:${oldMembership.documentId}`,
    });
    assert.equal(membershipAdapter.memberships.get(oldMembership.documentId).status, "expired");
    assert.equal(membershipAdapter.entries.filter((entry) =>
      entry.kind === "expire" && entry.membershipDocumentId === oldMembership.documentId).length, 1);
  } finally {
    if (previous.enabled === undefined) delete process.env.MEMBERSHIP_ENABLED;
    else process.env.MEMBERSHIP_ENABLED = previous.enabled;
    if (previous.secret === undefined) delete process.env.JAMORA_ADMIN_API_SECRET;
    else process.env.JAMORA_ADMIN_API_SECRET = previous.secret;
    globalThis.strapi = previous.strapi;
  }
});
