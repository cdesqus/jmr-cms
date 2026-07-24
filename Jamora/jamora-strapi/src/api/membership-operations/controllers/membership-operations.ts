import { hasStorefrontSecret } from "../../customer-auth/controllers/storefront-secret.cjs";

const body = (ctx: any) => ctx.request.body ?? {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const service = () => strapi.service("api::membership-operations.membership-operations") as any;

function enabled(ctx: any) {
  if (process.env.MEMBERSHIP_ENABLED === "true") return true;
  ctx.status = 404; ctx.body = { error: "Not found." }; return false;
}

async function customer(ctx: any) {
  if (!enabled(ctx)) return null;
  if (!hasStorefrontSecret(ctx.get("x-jamora-storefront-secret"), process.env.JAMORA_STOREFRONT_API_SECRET)) {
    ctx.status = 401; ctx.body = { error: "Storefront API secret required." }; return null;
  }
  const input = body(ctx);
  if (!text(input.documentId) || !Number.isInteger(input.sessionVersion)) {
    ctx.status = 400; ctx.body = { error: "Validated customer session fields are required." }; return null;
  }
  const result = await (strapi.service("api::customer-auth.customer-auth") as any)
    .findActiveSessionCustomer(text(input.documentId), input.sessionVersion);
  if (!result) { ctx.status = 401; ctx.body = { error: "Invalid session." }; return null; }
  return result;
}

function admin(ctx: any) {
  if (!enabled(ctx)) return null;
  const configured = process.env.JAMORA_ADMIN_API_SECRET;
  const actor = text(ctx.get("x-jamora-admin-actor"));
  const role = text(ctx.get("x-jamora-admin-role"));
  if (!configured || ctx.get("x-jamora-admin-secret") !== configured || !actor || role !== "owner") {
    ctx.status = 401; ctx.body = { error: "Owner admin credentials required." }; return null;
  }
  return { actor, role };
}

async function run(ctx: any, action: () => Promise<unknown>) {
  try { ctx.body = await action(); }
  catch (error) { ctx.status = /not found/i.test((error as Error).message) ? 404 : 409; ctx.body = { error: (error as Error).message }; }
}

export default {
  async plans(ctx: any) { if (enabled(ctx)) ctx.body = { plans: await service().listPlans(true) }; },
  async me(ctx: any) { const identity = await customer(ctx); if (identity) ctx.body = { memberships: await service().customerMemberships(identity.documentId) }; },
  async purchase(ctx: any) { const identity = await customer(ctx); if (identity) await run(ctx, () => service().preparePurchase(identity.documentId, text(body(ctx).planDocumentId))); },
  async renew(ctx: any) { const identity = await customer(ctx); if (identity) await run(ctx, () => service().preparePurchase(identity.documentId, text(body(ctx).planDocumentId), text(body(ctx).membershipDocumentId))); },
  async reserve(ctx: any) { const identity = await customer(ctx); if (identity) await run(ctx, async () => ownedOperation(identity.documentId, body(ctx).membershipDocumentId, () => service().reserveCredits({ membershipId: text(body(ctx).membershipDocumentId), checkoutReference: text(body(ctx).checkoutReference), credits: body(ctx).credits, idempotencyKey: text(body(ctx).idempotencyKey) }))); },
  async release(ctx: any) { const identity = await customer(ctx); if (identity) await run(ctx, async () => ownedOperation(identity.documentId, body(ctx).membershipDocumentId, () => service().releaseCredits({ membershipId: text(body(ctx).membershipDocumentId), checkoutReference: text(body(ctx).checkoutReference), idempotencyKey: text(body(ctx).idempotencyKey) }))); },
  async redeem(ctx: any) { const identity = await customer(ctx); if (identity) await run(ctx, async () => ownedOperation(identity.documentId, body(ctx).membershipDocumentId, () => service().redeemCredits({ membershipId: text(body(ctx).membershipDocumentId), checkoutReference: text(body(ctx).checkoutReference), orderId: text(body(ctx).orderDocumentId), idempotencyKey: text(body(ctx).idempotencyKey) }))); },
  async adminPlans(ctx: any) { if (admin(ctx)) ctx.body = { plans: await service().listPlans(false) }; },
  async createPlan(ctx: any) { if (admin(ctx)) await run(ctx, () => service().createPlan(body(ctx))); },
  async updatePlan(ctx: any) { if (admin(ctx)) await run(ctx, () => service().updatePlan(ctx.params.documentId, body(ctx))); },
  async memberships(ctx: any) { if (admin(ctx)) ctx.body = { memberships: await service().listMemberships() }; },
  async adjust(ctx: any) { const identity = admin(ctx); if (identity) await run(ctx, () => service().adjustCredits({ membershipId: ctx.params.documentId, creditDelta: body(ctx).creditDelta, reason: text(body(ctx).reason), actor: identity.actor, idempotencyKey: text(body(ctx).idempotencyKey) })); },
  async expireDue(ctx: any) { if (admin(ctx)) ctx.body = { expired: await service().expireDueMemberships(new Date(), 100) }; },
};

async function ownedOperation(customerDocumentId: string, membershipDocumentId: unknown, work: () => Promise<unknown>) {
  const memberships = await service().customerMemberships(customerDocumentId);
  if (!memberships.some((item: any) => item.documentId === text(membershipDocumentId))) throw new Error("Membership not found.");
  return work();
}
