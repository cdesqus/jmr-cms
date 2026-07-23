import { hasStorefrontSecret } from "../../customer-auth/controllers/storefront-secret.cjs";
import {
  consentRows,
  validateConsentDecision,
} from "../services/consent-decision.cjs";

export default {
  async createDecision(ctx: any) {
    if (!hasStorefrontSecret(
      ctx.get("x-jamora-storefront-secret"),
      process.env.JAMORA_STOREFRONT_API_SECRET,
    )) {
      ctx.status = 401;
      ctx.body = { error: "Storefront API secret required." };
      return;
    }
    try {
      const decision = validateConsentDecision(ctx.request.body);
      if (decision.customerDocumentId) {
        const customer = await strapi
          .service("api::customer-auth.customer-auth")
          .findActiveSessionCustomer(
            decision.customerDocumentId,
            ctx.request.body?.customerSessionVersion,
          );
        if (!customer) {
          ctx.status = 401;
          ctx.body = { error: "Invalid customer reference." };
          return;
        }
      }
      const documents = strapi.documents("api::customer-consent.customer-consent");
      for (const row of consentRows(decision)) {
        await documents.create({ data: row });
      }
      ctx.status = 202;
      ctx.body = { accepted: true };
    } catch {
      ctx.status = 400;
      ctx.body = { error: "Invalid consent decision." };
    }
  },
};
