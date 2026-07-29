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
import { preparePhase1MembershipPurchase } from "./services/phase1-membership-purchase.cjs";
import { createPhase1MembershipConfirmation } from "./services/phase1-membership-confirmation.cjs";
import { assertMembershipEnabled } from "./services/membership-service-contract.cjs";

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

function customerContext(body = {}) {
  const headers = {
    "x-jamora-storefront-secret": "storefront-secret",
    "x-jamora-customer-document-id": "customer-1",
    "x-jamora-customer-session-version": "3",
  };
  return {
    request: { body },
    get: (name) => headers[name.toLowerCase()] ?? "",
  };
}

test("Phase 1 route and service fixture smoke", async () => {
  const previous = {
    enabled: process.env.MEMBERSHIP_ENABLED,
    secret: process.env.JAMORA_ADMIN_API_SECRET,
    storefrontSecret: process.env.JAMORA_STOREFRONT_API_SECRET,
    strapi: globalThis.strapi,
  };
  const plans = new Map();
  let membershipSequence = 0;
  const purchaseMemberships = new Map();
  const membershipAdapter = createMemoryMembershipAdapter();
  const transactions = createMembershipTransactions(membershipAdapter, enabled);
  const confirmation = createPhase1MembershipConfirmation(transactions.activateMembership);
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
    preparePurchase: (customerDocumentId, planDocumentId, idempotencyKey, renewalOf) =>
      preparePhase1MembershipPurchase({
        findPlan: async (documentId) => plans.get(documentId) ?? null,
        findMembership: async (documentId) => purchaseMemberships.get(documentId) ?? null,
        findByPaymentReference: async (paymentDocumentId) =>
          [...purchaseMemberships.values()].find((item) =>
            item.paymentDocumentId === paymentDocumentId) ?? null,
        async createMembership(data) {
          const membership = { documentId: `membership-${++membershipSequence}`, ...data };
          purchaseMemberships.set(membership.documentId, membership);
          membershipAdapter.memberships.set(membership.documentId, structuredClone(membership));
          return membership;
        },
        confirm: async (input) => {
          const result = await confirmation.confirm({ ...input, now });
          purchaseMemberships.set(result.membership.documentId, structuredClone(result.membership));
          return result;
        },
        randomUUID: () => `${String(membershipSequence + 1).padStart(8, "0")}-fixture`,
      }, {
        customerDocumentId,
        planDocumentId,
        operation: renewalOf ? "renew" : "purchase",
        idempotencyKey,
        renewalOf,
      }),
  };
  globalThis.strapi = {
    service(uid) {
      if (uid === "api::customer-auth.customer-auth") {
        return {
          async findActiveSessionCustomer(documentId, sessionVersion) {
            assert.equal(documentId, "customer-1");
            assert.equal(sessionVersion, 3);
            return { documentId, email: "customer@example.test" };
          },
        };
      }
      return routeService;
    },
  };

  try {
    process.env.JAMORA_ADMIN_API_SECRET = "admin-secret";
    process.env.JAMORA_STOREFRONT_API_SECRET = "storefront-secret";
    delete process.env.MEMBERSHIP_ENABLED;
    const controller = (await import(`./controllers/membership-operations.ts?smoke=${Date.now()}`)).default;

    const disabledCalls = [
      [controller.plans, customerContext()],
      [controller.purchase, customerContext({ planDocumentId: "plan-1", idempotencyKey: "disabled" })],
      [controller.adminPlans, adminContext()],
      [controller.createPlan, adminContext({ name: "hidden" })],
    ];
    for (const [handler, disabled] of disabledCalls) {
      await handler(disabled);
      assert.equal(disabled.status, 404);
      assert.deepEqual(disabled.body, { error: "Not found." });
    }
    assert.throws(() => assertMembershipEnabled({ MEMBERSHIP_ENABLED: "FALSE" }), /not found/i);
    await assert.rejects(() => createMembershipTransactions(
      createMemoryMembershipAdapter(), {},
    ).activateMembership({}), /not found/i);

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
    const deactivate = adminContext({ active: false }, "plan-1");
    await controller.updatePlan(deactivate);
    assert.equal(deactivate.body.active, false);
    const reactivate = adminContext({ active: true }, "plan-1");
    await controller.updatePlan(reactivate);
    assert.equal(reactivate.body.active, true);
    const list = adminContext();
    await controller.adminPlans(list);
    assert.deepEqual(list.body.plans, [reactivate.body]);

    const purchaseInput = { planDocumentId: "plan-1", idempotencyKey: "purchase-1" };
    const purchase = customerContext(purchaseInput);
    await controller.purchase(purchase);
    const purchaseRetry = customerContext(purchaseInput);
    await controller.purchase(purchaseRetry);
    assert.equal(purchase.body.membership.status, "active");
    assert.equal(purchaseRetry.body.membership.documentId, purchase.body.membership.documentId);
    assert.equal(membershipAdapter.entries.filter((entry) =>
      entry.kind === "grant" &&
      entry.membershipDocumentId === purchase.body.membership.documentId).length, 1);

    const renew = customerContext({
      planDocumentId: "plan-1",
      membershipDocumentId: purchase.body.membership.documentId,
      idempotencyKey: "renew-1",
    });
    await controller.renew(renew);
    assert.notEqual(renew.body.membership.documentId, purchase.body.membership.documentId);
    assert.equal(
      purchaseMemberships.get(renew.body.membership.documentId).renewalOfMembershipDocumentId,
      purchase.body.membership.documentId,
    );
    assert.equal(membershipAdapter.entries.filter((entry) =>
      entry.kind === "grant" &&
      entry.membershipDocumentId === renew.body.membership.documentId).length, 1);

    const oldMembership = membershipAdapter.memberships.get(purchase.body.membership.documentId);
    oldMembership.cachedRemainingCredits = 99;

    const dashboard = await listCustomerMemberships({
      findMemberships: async () => [oldMembership],
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
        sku: "BK-001", name: "Beras Kencur",
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
        sku: "BK-001", name: "Beras Kencur",
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
    if (previous.storefrontSecret === undefined) delete process.env.JAMORA_STOREFRONT_API_SECRET;
    else process.env.JAMORA_STOREFRONT_API_SECRET = previous.storefrontSecret;
    globalThis.strapi = previous.strapi;
  }
});
