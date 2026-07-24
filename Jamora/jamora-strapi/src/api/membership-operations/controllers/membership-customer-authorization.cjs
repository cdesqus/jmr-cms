"use strict";

const { hasStorefrontSecret } = require("../../customer-auth/controllers/storefront-secret.cjs");

function fail(ctx, status, message) {
  ctx.status = status;
  ctx.body = { error: message };
  return null;
}

function positiveInteger(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function authorizeMembershipCustomer(ctx, findActiveSessionCustomer, env = process.env) {
  if (env.MEMBERSHIP_ENABLED !== "true") return fail(ctx, 404, "Not found.");
  if (!hasStorefrontSecret(ctx.get("x-jamora-storefront-secret"), env.JAMORA_STOREFRONT_API_SECRET)) {
    return fail(ctx, 401, "Storefront API secret required.");
  }

  const method = String(ctx.request?.method ?? "").toUpperCase();
  const documentIdHeader = ctx.get("x-jamora-customer-document-id");
  const sessionVersionHeader = ctx.get("x-jamora-customer-session-version");
  const input = method === "GET" ? {} : (ctx.request?.body ?? {});
  const documentId = typeof documentIdHeader === "string" && documentIdHeader.trim()
    ? documentIdHeader.trim()
    : typeof input.documentId === "string" ? input.documentId.trim() : "";
  const sessionVersion = positiveInteger(
    sessionVersionHeader || input.sessionVersion,
  );
  if (!documentId || sessionVersion === null) {
    return fail(ctx, 400, "Validated customer session fields are required.");
  }

  const customer = await findActiveSessionCustomer(documentId, sessionVersion);
  if (!customer) return fail(ctx, 401, "Invalid session.");
  return customer;
}

module.exports = { authorizeMembershipCustomer };
