"use strict";
const { customerAuthGate } = require("./customer-auth-policy.cjs");
const { hasStorefrontSecret } = require("./storefront-secret.cjs");

function authorizeCustomerSession(ctx, env = process.env) {
  if (!customerAuthGate(ctx, env)) return false;
  if (!hasStorefrontSecret(ctx.get("x-jamora-storefront-secret"), env.JAMORA_STOREFRONT_API_SECRET)) {
    ctx.status = 401;
    ctx.body = { error: "Storefront API secret required." };
    return false;
  }
  return true;
}
module.exports = { authorizeCustomerSession };
