import { hasStorefrontSecret } from "../../customer-auth/controllers/storefront-secret.cjs";
import {
  assessRomanianAddress,
} from "../services/address-domain.cjs";
import { suggestRomanianAddresses } from "../services/address-adapter.cjs";
import { createHash } from "node:crypto";
import {
  LABEL_CONTENT_TYPES,
  createMockShippingProvider,
  createShipmentTransactions,
  createStrapiShipmentAdapter,
} from "../services/shipment-transaction.cjs";
import {
  createStrapiTrackingAdapter,
  createTrackingDomain,
  pollLimit,
} from "../services/tracking-domain.cjs";
import {
  createAuthenticatedTrackingLimiter,
  verifyTrackingWebhook,
} from "../../../middlewares/shipping-webhook-guard.cjs";
import {
  claimCustomerTrackingCapability,
  createStrapiTrackingCapabilityAdapter,
  manageTrackingCapabilities,
  reissueLegacyTrackingCapabilities,
} from "../services/tracking-capability-reissue.cjs";
import {
  assertAddressProviderMode,
  assertShippingProviderMode,
} from "../services/shipping-provider-config.cjs";

const MAX_BODY_BYTES = 4_096;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateWindows = new Map<string, { startedAt: number; count: number }>();
const defaultAuthenticatedTrackingLimiter =
  createAuthenticatedTrackingLimiter({
    providerLimit: process.env.SHIPPING_WEBHOOK_PROVIDER_RATE_LIMIT,
    eventLimit: process.env.SHIPPING_WEBHOOK_EVENT_RATE_LIMIT,
    windowMs: process.env.SHIPPING_WEBHOOK_RATE_WINDOW_MS,
    maxBuckets: process.env.SHIPPING_WEBHOOK_RATE_MAX_BUCKETS,
  });

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function withTransaction(trx: any, value: any) {
  return trx ? { ...value, transacting: trx } : value;
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

function shippingEnabled(ctx: any) {
  return process.env.SHIPPING_ENABLED === "true"
    ? true
    : fail(ctx, 404, "Not found.");
}

function assessmentEnabled(ctx: any) {
  return process.env.ADDRESS_ASSIST_ENABLED === "true" ||
    process.env.SHIPPING_ENABLED === "true"
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

function identityRateKey(identity: any) {
  const value = identity.customerDocumentId
    ? `customer:${identity.customerDocumentId}`
    : `guest:${identity.guestCheckoutCapability}`;
  return createHash("sha256").update(value).digest("hex");
}

function withinRateLimit(ctx: any, identity: any) {
  const now = Date.now();
  const key = identityRateKey(identity);
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

async function lockLiveGuestReservation(capability: string) {
  return strapi.db.transaction(async ({ trx }: { trx: any }) => {
    const query = strapi.db.query("api::stock-reservation.stock-reservation");
    const candidate = await query.findOne(withTransaction(trx, {
      where: { token: capability },
    }));
    if (!candidate?.documentId) return null;
    await strapi.db.connection("stock_reservations")
      .where({ document_id: candidate.documentId })
      .transacting(trx)
      .forUpdate()
      .first();
    const reservation = await query.findOne(withTransaction(trx, {
      where: { documentId: candidate.documentId },
    }));
    const expiresAt = new Date(reservation?.expiresAt);
    return reservation?.token === capability &&
      reservation?.status === "reserved" &&
      Number.isFinite(expiresAt.getTime()) &&
      expiresAt > new Date()
      ? reservation
      : null;
  });
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
  if (body.subjectType === "membership_checkout") {
    fail(ctx, 401, "Verified customer session required for membership checkout.");
    return null;
  }
  const reservation = await lockLiveGuestReservation(guestCheckoutCapability);
  if (!reservation) {
    fail(ctx, 401, "Invalid or expired guest checkout capability.");
    return null;
  }
  return {
    guestCheckoutCapability,
    reservationExpiresAt: reservation.expiresAt,
  };
}

async function verifiedCustomerIdentity(ctx: any) {
  if (!hasStorefrontSecret(
    ctx.get("x-jamora-storefront-secret"),
    process.env.JAMORA_STOREFRONT_API_SECRET,
  )) {
    fail(ctx, 401, "Storefront API secret required.");
    return null;
  }
  const documentId = text(ctx.get("x-jamora-customer-document-id"));
  const sessionVersionText = text(ctx.get("x-jamora-customer-session-version"));
  if (!documentId || !/^\d+$/.test(sessionVersionText)) {
    fail(ctx, 401, "Invalid session.");
    return null;
  }
  const sessionVersion = Number(sessionVersionText);
  if (!Number.isSafeInteger(sessionVersion)) {
    fail(ctx, 401, "Invalid session.");
    return null;
  }
  const customer = await (
    strapi.service("api::customer-auth.customer-auth") as any
  ).findActiveSessionCustomer(documentId, sessionVersion);
  if (!customer?.documentId) {
    fail(ctx, 401, "Invalid session.");
    return null;
  }
  return { customerDocumentId: customer.documentId };
}

function hasRequiredMembershipCustomer(
  ctx: any,
  body: Record<string, unknown>,
  identity: any,
) {
  if (body.subjectType !== "membership_checkout" ||
      identity.customerDocumentId) {
    return true;
  }
  fail(
    ctx,
    401,
    "Verified customer session required for membership checkout.",
  );
  return false;
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

function safeQuote(quote: any) {
  return {
    quoteId: quote.quoteId,
    carrier: quote.carrier,
    service: quote.service,
    amountMinor: quote.amountMinor,
    currency: quote.currency,
    estimate: {
      minimumDays: quote.estimate?.minimumDays,
      maximumDays: quote.estimate?.maximumDays,
    },
    quotedAt: quote.quotedAt,
    expiresAt: quote.expiresAt,
  };
}

function guarded(ctx: any) {
  if (!enabled(ctx) || !isJsonRequest(ctx)) return null;
  return requestBody(ctx);
}

function assessmentGuarded(ctx: any) {
  if (!assessmentEnabled(ctx) || !isJsonRequest(ctx)) return null;
  return requestBody(ctx);
}

function shippingGuarded(ctx: any) {
  if (!shippingEnabled(ctx) || !isJsonRequest(ctx)) return null;
  return requestBody(ctx);
}

async function run(ctx: any, action: () => Promise<unknown>) {
  try {
    ctx.body = await action();
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error("Shipping operation failed.");
    if (/not found/i.test(error.message)) ctx.status = 404;
    else if (caught instanceof TypeError || /\brequired\b|\binvalid\b/i.test(error.message)) {
      ctx.status = 400;
    } else {
      ctx.status = 409;
    }
    ctx.body = { error: error.message };
  }
}

function shipmentAdmin(ctx: any) {
  if (!shippingEnabled(ctx)) return null;
  const configured = process.env.JAMORA_ADMIN_API_SECRET;
  const actor = text(ctx.get("x-jamora-admin-actor"));
  const role = text(ctx.get("x-jamora-admin-role"));
  if (!configured ||
      ctx.get("x-jamora-admin-secret") !== configured ||
      !actor ||
      !["owner", "warehouse"].includes(role)) {
    fail(ctx, 401, "Owner or warehouse admin credentials required.");
    return null;
  }
  return { actor, role };
}

function capabilityTtlSeconds() {
  const configured = text(process.env.SHIPMENT_LABEL_CAPABILITY_TTL_SECONDS);
  if (!configured) return 60;
  if (!/^\d+$/.test(configured)) {
    throw new TypeError("Label capability TTL is invalid.");
  }
  return Number(configured);
}

function defaultShipmentTransactions() {
  assertShippingProviderMode(process.env);
  return createShipmentTransactions({
    adapter: createStrapiShipmentAdapter(strapi),
    provider: createMockShippingProvider(),
    capabilitySecret: process.env.SHIPMENT_LABEL_CAPABILITY_SECRET,
    capabilityTtlSeconds: capabilityTtlSeconds(),
  });
}

function defaultTrackingDomain() {
  assertShippingProviderMode(process.env);
  return createTrackingDomain({
    adapter: createStrapiTrackingAdapter(strapi),
    provider: createMockShippingProvider(),
  });
}

function defaultTrackingCapabilityOperations() {
  const adapter = createStrapiTrackingCapabilityAdapter(strapi);
  return {
    reissue: (input: any) =>
      reissueLegacyTrackingCapabilities({ adapter, ...input }),
    claim: (input: any) =>
      claimCustomerTrackingCapability({ adapter, ...input }),
    manage: (input: any) =>
      manageTrackingCapabilities({ adapter, ...input }),
  };
}

function safeReissueSummary(value: any) {
  const field = (name: string) => {
    const result = Number(value?.[name]);
    return Number.isSafeInteger(result) && result >= 0 ? result : 0;
  };
  return {
    selected: field("selected"),
    queued: field("queued"),
    skippedIneligible: field("skippedIneligible"),
    skippedConcurrent: field("skippedConcurrent"),
    remainingUnreviewed: field("remainingUnreviewed"),
  };
}

function safeManagementSummary(value: any) {
  const field = (name: string) => {
    const result = Number(value?.[name]);
    return Number.isSafeInteger(result) && result >= 0 ? result : 0;
  };
  return {
    selected: field("selected"),
    updated: field("updated"),
    skippedConcurrent: field("skippedConcurrent"),
  };
}

function safeCapability(value: any) {
  return {
    capability: text(value?.capability),
    expiresAt: text(value?.expiresAt),
    format: text(value?.format),
  };
}

async function runShipment(ctx: any, action: () => Promise<unknown>) {
  try {
    ctx.body = await action();
  } catch (caught) {
    const error = caught instanceof Error
      ? caught
      : new Error("Shipping operation failed.");
    if (/invalid label capability/i.test(error.message)) {
      return fail(ctx, 401, "Invalid label capability.");
    }
    if (/expired label capability/i.test(error.message)) {
      return fail(ctx, 410, "Expired label capability.");
    }
    if (/used label capability/i.test(error.message)) {
      return fail(ctx, 409, "Used label capability.");
    }
    if (/not found/i.test(error.message)) return fail(ctx, 404, "Not found.");
    if (/^(?:Order|Shipment) document ID is required\.$/.test(error.message) ||
        error.message === "Label format must be PDF or ZPL.") {
      return fail(ctx, 400, error.message);
    }
    if (/paid order|packed order|order shipping carrier|label format is unavailable|duplicate shipment/i.test(error.message)) {
      return fail(ctx, 409, error.message);
    }
    return fail(ctx, 502, "Shipping service unavailable.");
  }
}

function safeAttachmentFilename(value: unknown, contentType: string) {
  const filename = text(value);
  if (/^[A-Za-z0-9._-]+$/.test(filename)) return filename;
  return contentType === LABEL_CONTENT_TYPES.zpl
    ? "shipment-label.zpl"
    : "shipment-label.pdf";
}

const publicController = {
  async suggestAddress(ctx: any) {
    const body = guarded(ctx);
    const identity = body ? await checkoutIdentity(ctx, body) : null;
    if (!body || !identity || !withinRateLimit(ctx, identity)) return;
    const query = text(body.query);
    if (!query) return fail(ctx, 400, "Invalid address query.");
    try {
      assertAddressProviderMode(process.env);
      ctx.body = { suggestions: suggestRomanianAddresses(query).map(safeSuggestion) };
    } catch (caught) {
      if (caught instanceof TypeError) return fail(ctx, 400, "Invalid address query.");
      return fail(ctx, 500, "Address assistance unavailable.");
    }
  },

  async assessAddress(ctx: any) {
    const body = assessmentGuarded(ctx);
    const identity = body ? await checkoutIdentity(ctx, body) : null;
    if (!body || !identity || !withinRateLimit(ctx, identity)) return;
    if (!body.address || Array.isArray(body.address) || typeof body.address !== "object") {
      return fail(ctx, 400, "Structured address required.");
    }
    ctx.body = safeAssessment(assessRomanianAddress(body.address));
  },

  async quoteShipping(ctx: any) {
    const body = shippingGuarded(ctx);
    const identity = body ? await checkoutIdentity(ctx, body) : null;
    if (!body || !identity ||
        !hasRequiredMembershipCustomer(ctx, body, identity) ||
        !withinRateLimit(ctx, identity)) return;
    await run(ctx, async () => ({
      quotes: (await (
        strapi.service("api::shipping-operations.shipping-quote") as any
      ).quoteShipping({
        address: body.address,
        items: body.items,
        subjectType: body.subjectType,
        ...identity,
        now: new Date(),
      })).map(safeQuote),
    }));
  },

  async selectShippingQuote(ctx: any) {
    const body = shippingGuarded(ctx);
    const identity = body ? await checkoutIdentity(ctx, body) : null;
    if (!body || !identity ||
        !hasRequiredMembershipCustomer(ctx, body, identity) ||
        !withinRateLimit(ctx, identity)) return;
    await run(ctx, async () => {
      const result = await (
        strapi.service("api::shipping-operations.shipping-quote") as any
      ).selectShippingQuote({
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        selection: body.selection,
        address: body.address,
        ...identity,
        now: new Date(),
      });
      return {
        idempotent: result.idempotent === true,
        shipping: safeQuote(result.snapshot),
      };
    });
  },
};

export function createShippingOperationsController({
  shipmentTransactions = defaultShipmentTransactions,
  trackingDomain = defaultTrackingDomain,
  verifyWebhook = verifyTrackingWebhook,
  authenticatedTrackingLimiter = defaultAuthenticatedTrackingLimiter,
  trackingCapabilityOperations = defaultTrackingCapabilityOperations,
}: {
  shipmentTransactions?: () => any;
  trackingDomain?: () => any;
  verifyWebhook?: (input: any) => any;
  authenticatedTrackingLimiter?: {
    check: (event: any) => { allowed: boolean; retryAfter?: number };
  };
  trackingCapabilityOperations?: () => any;
} = {}) {
  return {
    ...publicController,

    async trackingWebhook(ctx: any) {
      if (!shippingEnabled(ctx)) return;
      const body = requestBody(ctx);
      if (!body) return;
      let verified;
      try {
        verified = verifyWebhook({
          payload: body,
          providerHeader: text(ctx.get("x-jamora-shipping-provider")),
          timestamp: text(ctx.get("x-jamora-shipping-timestamp")),
          signature: text(ctx.get("x-jamora-shipping-signature")),
          secret: process.env.SHIPPING_TRACKING_WEBHOOK_SECRET,
          now: new Date(),
        });
      } catch {
        return fail(ctx, 401, "Request could not be completed.");
      }
      const limited = authenticatedTrackingLimiter.check(verified);
      if (!limited.allowed) {
        if (limited.retryAfter) ctx.set("Retry-After", String(limited.retryAfter));
        return fail(ctx, 429, "Request could not be completed.");
      }
      try {
        const result = await trackingDomain().applyTrackingEvent({
          event: verified,
          source: "webhook",
          receivedAt: new Date(),
        });
        ctx.body = {
          accepted: true,
          idempotent: result.idempotent === true,
          applied: result.applied === true,
          outcome: result.outcome,
          status: result.shipment?.status,
        };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "";
        if (/shipment not found/i.test(message)) {
          return fail(ctx, 404, "Request could not be completed.");
        }
        if (/provider event replay conflict/i.test(message)) {
          return fail(ctx, 409, "Request could not be completed.");
        }
        if (caught instanceof TypeError || /\binvalid\b/i.test(message)) {
          return fail(ctx, 400, "Request could not be completed.");
        }
        return fail(ctx, 502, "Request could not be completed.");
      }
    },

    async pollTracking(ctx: any) {
      const identity = shipmentAdmin(ctx);
      if (!identity || !isJsonRequest(ctx)) return;
      if (identity.role !== "owner") {
        return fail(ctx, 403, "Owner credentials required.");
      }
      const body = requestBody(ctx);
      if (!body) return;
      let limit;
      try {
        limit = pollLimit(body.limit);
      } catch (caught) {
        return fail(
          ctx,
          400,
          caught instanceof Error ? caught.message : "Invalid request.",
        );
      }
      await runShipment(ctx, async () =>
        trackingDomain().pollOpenShipments({ limit }));
    },

    async claimTrackingCapability(ctx: any) {
      if (!shippingEnabled(ctx) || !isJsonRequest(ctx)) return;
      const identity = await verifiedCustomerIdentity(ctx);
      if (!identity) return;
      const body = requestBody(ctx);
      if (!body) return;
      await runShipment(ctx, async () =>
        trackingCapabilityOperations().claim({
          ...identity,
          orderDocumentId: body.orderDocumentId,
          storefrontUrl:
            process.env.JAMORA_STOREFRONT_URL ??
            process.env.PUBLIC_URL ??
            "http://localhost:3095",
        }));
    },

    async manageTrackingCapabilities(ctx: any) {
      const identity = shipmentAdmin(ctx);
      if (!identity || !isJsonRequest(ctx)) return;
      if (identity.role !== "owner") {
        return fail(ctx, 403, "Owner credentials required.");
      }
      const body = requestBody(ctx);
      if (!body) return;
      try {
        ctx.body = safeManagementSummary(
          await trackingCapabilityOperations().manage({
            actor: identity.actor,
            action: body.action,
            orderDocumentIds: body.orderDocumentIds,
          }),
        );
      } catch (caught) {
        if (caught instanceof TypeError) return fail(ctx, 400, caught.message);
        return fail(ctx, 502, "Shipping service unavailable.");
      }
    },

    async reissueTrackingCapabilities(ctx: any) {
      const identity = shipmentAdmin(ctx);
      if (!identity || !isJsonRequest(ctx)) return;
      if (identity.role !== "owner") {
        return fail(ctx, 403, "Owner credentials required.");
      }
      const body = requestBody(ctx);
      if (!body) return;
      try {
        const result = await trackingCapabilityOperations().reissue({
          actor: identity.actor,
          limit: body.limit,
          storefrontUrl:
            process.env.JAMORA_STOREFRONT_URL ??
            process.env.PUBLIC_URL ??
            "http://localhost:3095",
        });
        ctx.body = safeReissueSummary(result);
      } catch (caught) {
        if (caught instanceof TypeError) {
          return fail(ctx, 400, caught.message);
        }
        return fail(ctx, 502, "Shipping service unavailable.");
      }
    },

    async createShipment(ctx: any) {
      const identity = shipmentAdmin(ctx);
      if (!identity || !isJsonRequest(ctx)) return;
      if (!requestBody(ctx)) return;
      await runShipment(ctx, async () => shipmentTransactions().createShipment({
        orderDocumentId: text(ctx.params?.orderDocumentId),
        actor: identity.actor,
        now: new Date(),
      }));
    },

    async createLabelCapability(ctx: any) {
      const identity = shipmentAdmin(ctx);
      if (!identity || !isJsonRequest(ctx)) return;
      const body = requestBody(ctx);
      if (!body) return;
      await runShipment(ctx, async () => safeCapability(
        await shipmentTransactions().createLabelCapability({
          shipmentDocumentId: text(ctx.params?.shipmentDocumentId),
          format: body?.format,
          actor: identity.actor,
          now: new Date(),
        }),
      ));
    },

    async downloadLabel(ctx: any) {
      const identity = shipmentAdmin(ctx);
      if (!identity) return;
      await runShipment(ctx, async () => {
        const label = await shipmentTransactions().downloadLabel({
          shipmentDocumentId: text(ctx.params?.shipmentDocumentId),
          capability: text(ctx.query?.capability),
          now: new Date(),
        });
        if (!Object.values(LABEL_CONTENT_TYPES).includes(label?.contentType) ||
            !Buffer.isBuffer(label?.body)) {
          throw new Error("Invalid private label response.");
        }
        const filename = safeAttachmentFilename(label.filename, label.contentType);
        ctx.set("Content-Type", label.contentType);
        ctx.set("Content-Disposition", `attachment; filename="${filename}"`);
        ctx.set("Cache-Control", "no-store, private");
        ctx.set("X-Content-Type-Options", "nosniff");
        return label.body;
      });
    },
  };
}

export default createShippingOperationsController();
