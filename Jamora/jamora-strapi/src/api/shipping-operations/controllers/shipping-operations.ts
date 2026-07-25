import { hasStorefrontSecret } from "../../customer-auth/controllers/storefront-secret.cjs";
import {
  assessRomanianAddress,
} from "../services/address-domain.cjs";
import { suggestRomanianAddresses } from "../services/address-adapter.cjs";

const MAX_BODY_BYTES = 4_096;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(ctx: any, status: number, message: string) {
  ctx.status = status;
  ctx.body = { error: message };
  return false;
}

function enabled(ctx: any) {
  return process.env.ADDRESS_ASSIST_ENABLED === "true"
    ? true
    : fail(ctx, 404, "Not found.");
}

function isJsonRequest(ctx: any) {
  if (ctx.request?.is?.("application/json")) return true;
  return fail(ctx, 415, "JSON request required.");
}

function requestBody(ctx: any) {
  const contentLength = Number(ctx.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    fail(ctx, 413, "Request is too large.");
    return null;
  }
  const body = ctx.request?.body;
  if (!body || Array.isArray(body) || typeof body !== "object") {
    fail(ctx, 400, "Invalid request.");
    return null;
  }
  try {
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) {
      fail(ctx, 413, "Request is too large.");
      return null;
    }
  } catch {
    fail(ctx, 400, "Invalid request.");
    return null;
  }
  return body;
}

function withinRateLimit(ctx: any) {
  const now = Date.now();
  const key = text(ctx.ip) || "unknown";
  const existing = rateWindows.get(key);
  const window = !existing || now - existing.startedAt >= RATE_WINDOW_MS
    ? { startedAt: now, count: 0 }
    : existing;
  window.count += 1;
  rateWindows.set(key, window);
  if (rateWindows.size > 2_000) {
    for (const [candidate, value] of rateWindows) {
      if (now - value.startedAt >= RATE_WINDOW_MS) rateWindows.delete(candidate);
    }
  }
  return window.count <= RATE_LIMIT || fail(ctx, 429, "Too many requests.");
}

async function checkoutIdentity(ctx: any, body: Record<string, unknown>) {
  if (!hasStorefrontSecret(
    ctx.get("x-jamora-storefront-secret"),
    process.env.JAMORA_STOREFRONT_API_SECRET,
  )) {
    fail(ctx, 401, "Storefront API secret required.");
    return null;
  }

  const documentId = text(ctx.get("x-jamora-customer-document-id"));
  const sessionVersionText = text(ctx.get("x-jamora-customer-session-version"));
  if (documentId || sessionVersionText) {
    if (!documentId || !/^\d+$/.test(sessionVersionText)) {
      fail(ctx, 400, "Validated customer session fields are required.");
      return null;
    }
    const sessionVersion = Number(sessionVersionText);
    if (!Number.isSafeInteger(sessionVersion)) {
      fail(ctx, 400, "Validated customer session fields are required.");
      return null;
    }
    const customer = await (strapi.service("api::customer-auth.customer-auth") as any)
      .findActiveSessionCustomer(documentId, sessionVersion);
    if (!customer) {
      fail(ctx, 401, "Invalid session.");
      return null;
    }
    return { customerDocumentId: customer.documentId };
  }

  const guestCheckoutCapability = text(
    ctx.get("x-jamora-checkout-capability") || body.guestCheckoutCapability,
  );
  if (!guestCheckoutCapability) {
    fail(ctx, 401, "Verified customer session or guest checkout capability required.");
    return null;
  }
  return { guestCheckoutCapability };
}

function safeSuggestion(suggestion: any) {
  return {
    countryCode: suggestion.countryCode,
    subdivisionCode: suggestion.subdivisionCode,
    locality: suggestion.locality,
    postalCode: suggestion.postalCode,
    street: suggestion.street,
    building: suggestion.building,
  };
}

function safeAssessment(assessment: any) {
  return {
    address: {
      recipient: assessment.address.recipient,
      phone: assessment.address.phone,
      countryCode: assessment.address.countryCode,
      subdivisionCode: assessment.address.subdivisionCode,
      locality: assessment.address.locality,
      postalCode: assessment.address.postalCode,
      street: assessment.address.street,
      building: assessment.address.building,
      unit: assessment.address.unit,
      instructions: assessment.address.instructions,
    },
    errors: assessment.errors,
    warnings: assessment.warnings,
  };
}

function guarded(ctx: any) {
  if (!enabled(ctx) || !isJsonRequest(ctx) || !withinRateLimit(ctx)) return null;
  return requestBody(ctx);
}

export default {
  async suggestAddress(ctx: any) {
    const body = guarded(ctx);
    if (!body || !(await checkoutIdentity(ctx, body))) return;
    const query = text(body.query);
    if (!query) return fail(ctx, 400, "Invalid address query.");
    try {
      ctx.body = { suggestions: suggestRomanianAddresses(query).map(safeSuggestion) };
    } catch (caught) {
      if (caught instanceof TypeError) return fail(ctx, 400, "Invalid address query.");
      return fail(ctx, 500, "Address assistance unavailable.");
    }
  },

  async assessAddress(ctx: any) {
    const body = guarded(ctx);
    if (!body || !(await checkoutIdentity(ctx, body))) return;
    if (!body.address || Array.isArray(body.address) || typeof body.address !== "object") {
      return fail(ctx, 400, "Structured address required.");
    }
    ctx.body = safeAssessment(assessRomanianAddress(body.address));
  },
};
