"use strict";

function accountsAvailable(env = process.env) {
  if (env.CUSTOMER_ACCOUNTS_ENABLED !== "true") return false;
  return env.NODE_ENV !== "production" ||
    env.CUSTOMER_VERIFICATION_DELIVERY_ENABLED === "true";
}

function customerAuthGate(ctx, env = process.env) {
  if (accountsAvailable(env)) return true;
  ctx.status = 404;
  ctx.body = { error: "Not found." };
  return false;
}

module.exports = { accountsAvailable, customerAuthGate };
