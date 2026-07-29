import { hasStorefrontSecret } from "../../customer-auth/controllers/storefront-secret.cjs";

function adminAllowed(ctx: any) {
  return hasStorefrontSecret(
    ctx.get("x-jamora-admin-secret") || ctx.get("x-jamora-storefront-secret"),
    process.env.JAMORA_ADMIN_API_SECRET || process.env.JAMORA_STOREFRONT_API_SECRET,
  ) || ctx.state?.admin;
}

function enabled() {
  return process.env.AFFILIATES_ENABLED === "true";
}

export default {
  async adminList(ctx: any) {
    if (!enabled() || !adminAllowed(ctx)) {
      ctx.status = 404;
      ctx.body = { error: "Not found." };
      return;
    }
    const affiliates = await (strapi.service("api::affiliate-operations.affiliate-operations") as any)
      .listAdminAffiliates();
    ctx.body = { affiliates };
  },
  async adminCreate(ctx: any) {
    if (!enabled() || !adminAllowed(ctx)) {
      ctx.status = 404;
      ctx.body = { error: "Not found." };
      return;
    }
    try {
      const affiliate = await (strapi.service("api::affiliate-operations.affiliate-operations") as any)
        .createAffiliate(ctx.request.body ?? {});
      ctx.body = { affiliate };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { error: error instanceof Error ? error.message : "Could not create affiliate." };
    }
  },
  async publicClick(ctx: any) {
    if (!enabled()) {
      ctx.status = 404;
      ctx.body = { error: "Not found." };
      return;
    }
    const attribution = await (strapi.service("api::affiliate-operations.affiliate-operations") as any)
      .recordClick(ctx.request.body ?? {});
    ctx.body = { attribution };
  },
};
