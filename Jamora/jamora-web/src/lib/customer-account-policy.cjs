"use strict";
function customerAccountsAvailable(env = process.env) {
  if (env.CUSTOMER_ACCOUNTS_ENABLED !== "true") return false;
  return env.NODE_ENV !== "production" ||
    env.CUSTOMER_VERIFICATION_DELIVERY_ENABLED === "true";
}
module.exports = { customerAccountsAvailable };
