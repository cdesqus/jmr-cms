import { hasStorefrontSecret } from "../../customer-auth/controllers/storefront-secret.cjs";

const paymentService = () =>
  strapi.service("api::payment-operations.payment-operations") as any;
const requestBody = (ctx: any) => ctx.request?.body ?? {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function fail(ctx: any, status: number, message: string) {
  ctx.status = status;
  ctx.body = { error: message };
  return null;
}

function enabled(ctx: any) {
  return process.env.PAYMENTS_ENABLED === "true"
    ? true
    : fail(ctx, 404, "Not found.");
}

function ropayEnabled(ctx: any) {
  if (!enabled(ctx)) return false;
  return process.env.ROPAY_ENABLED === "true"
    ? true
    : fail(ctx, 404, "Not found.");
}

function nonNegativeInteger(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function trustedStorefront(ctx: any) {
  if (!enabled(ctx)) return false;
  if (!hasStorefrontSecret(
    ctx.get("x-jamora-storefront-secret"),
    process.env.JAMORA_STOREFRONT_API_SECRET,
  )) {
    fail(ctx, 401, "Storefront API secret required.");
    return false;
  }
  return true;
}

async function preparationIdentity(ctx: any) {
  if (!trustedStorefront(ctx)) return null;
  const input = requestBody(ctx);
  const documentId = text(
    ctx.get("x-jamora-customer-document-id") || input.documentId,
  );
  const rawVersion =
    ctx.get("x-jamora-customer-session-version") || input.sessionVersion;
  const hasSessionInput = Boolean(documentId || rawVersion !== undefined && rawVersion !== "");
  if (hasSessionInput) {
    const sessionVersion = nonNegativeInteger(rawVersion);
    if (!documentId || sessionVersion === null) {
      return fail(ctx, 400, "Validated customer session fields are required.");
    }
    const customer = await (
      strapi.service("api::customer-auth.customer-auth") as any
    ).findActiveSessionCustomer(documentId, sessionVersion);
    if (!customer) return fail(ctx, 401, "Invalid session.");
    return { customer };
  }

  const guestCheckoutCapability = text(
    ctx.get("x-jamora-checkout-capability") || input.guestCheckoutCapability,
  );
  if (!guestCheckoutCapability || input.subjectType !== "order" || input.purpose !== "order") {
    return fail(ctx, 401, "Verified customer session or guest checkout capability required.");
  }
  return { guestCheckoutCapability };
}

function owner(ctx: any) {
  if (!enabled(ctx)) return null;
  const configured = process.env.JAMORA_ADMIN_API_SECRET;
  const actor = text(ctx.get("x-jamora-admin-actor"));
  const role = text(ctx.get("x-jamora-admin-role"));
  if (!configured ||
      ctx.get("x-jamora-admin-secret") !== configured ||
      !actor ||
      role !== "owner") {
    return fail(ctx, 401, "Owner admin credentials required.");
  }
  return { actor };
}

async function run(ctx: any, action: () => Promise<unknown>) {
  try {
    ctx.body = await action();
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error("Payment operation failed.");
    const statusCode = (error as any).statusCode;
    const retryAfter = (error as any).retryAfter;
    if (statusCode === 429) {
      ctx.status = 429;
      if (Number.isSafeInteger(retryAfter) && retryAfter > 0) {
        ctx.set("Retry-After", String(retryAfter));
      }
      ctx.body = { error: "Request could not be completed." };
      return;
    }
    if (/signature verification failed/i.test(error.message)) ctx.status = 401;
    else if (/not found/i.test(error.message)) ctx.status = 404;
    else if (caught instanceof TypeError || /\brequired\b|\binvalid\b|safe integer/i.test(error.message)) {
      ctx.status = 400;
    } else {
      ctx.status = 409;
    }
    ctx.body = { error: error.message };
  }
}

function safeTransfer(payment: any) {
  return {
    method: payment.method,
    status: payment.status,
    paymentReference: payment.paymentReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    expiresAt: payment.expiresAt,
    beneficiary: payment.priceSnapshot?.bankTransfer,
  };
}

function safeRoPay(payment: any) {
  return {
    method: payment.method,
    status: payment.status,
    paymentReference: payment.paymentReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    expiresAt: payment.expiresAt,
    ...(typeof payment.qrUrl === "string" ? { qrUrl: payment.qrUrl } : {}),
    ...(typeof payment.deepLink === "string"
      ? { deepLink: payment.deepLink }
      : {}),
  };
}

function safeRoPayStatus(payment: any) {
  return {
    method: payment.method,
    status: payment.status,
    paymentReference: payment.paymentReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    expiresAt: payment.expiresAt,
  };
}

function providerEnvelope(ctx: any) {
  return {
    payload: requestBody(ctx),
    signature: text(ctx.get("x-ropay-signature")),
    timestamp: text(ctx.get("x-ropay-timestamp")),
    providerReference: text(ctx.get("x-ropay-provider-reference")),
  };
}

async function statusIdentity(ctx: any) {
  if (!trustedStorefront(ctx)) return null;
  const documentId = text(ctx.get("x-jamora-customer-document-id"));
  const rawVersion = ctx.get("x-jamora-customer-session-version");
  if (documentId || rawVersion !== "") {
    const sessionVersion = nonNegativeInteger(rawVersion);
    if (!documentId || sessionVersion === null) {
      return fail(ctx, 400, "Validated customer session fields are required.");
    }
    const customer = await (
      strapi.service("api::customer-auth.customer-auth") as any
    ).findActiveSessionCustomer(documentId, sessionVersion);
    if (!customer) return fail(ctx, 401, "Invalid session.");
    return { customer };
  }
  const guestCheckoutCapability = text(ctx.get("x-jamora-checkout-capability"));
  if (!guestCheckoutCapability) {
    return fail(ctx, 401, "Verified customer session or guest checkout capability required.");
  }
  return { guestCheckoutCapability };
}

export default {
  async prepareBankTransfer(ctx: any) {
    const identity = await preparationIdentity(ctx);
    if (!identity) return;
    const input = requestBody(ctx);
    await run(ctx, async () => safeTransfer(
      await paymentService().prepareBankTransfer({
        ...input,
        customerDocumentId: identity.customer?.documentId,
        ownerDocumentId: identity.customer?.documentId,
        guestCheckoutCapability: identity.guestCheckoutCapability,
        now: new Date(),
      }),
    ));
  },

  async prepareRoPay(ctx: any) {
    if (!ropayEnabled(ctx)) return;
    const identity = await preparationIdentity(ctx);
    if (!identity) return;
    const input = requestBody(ctx);
    await run(ctx, async () => safeRoPay(
      await paymentService().createRoPayIntent({
        ...input,
        customerDocumentId: identity.customer?.documentId,
        ownerDocumentId: identity.customer?.documentId,
        guestCheckoutCapability: identity.guestCheckoutCapability,
        now: new Date(),
      }),
    ));
  },

  async handleRoPayCallback(ctx: any) {
    if (!ropayEnabled(ctx)) return;
    await run(ctx, async () => {
      const result = await paymentService().handleRoPayCallback(providerEnvelope(ctx));
      return {
        accepted: true,
        status: result.status,
        idempotent: Boolean(result.idempotent),
      };
    });
  },

  async verifyRoPayStatus(ctx: any) {
    if (!ropayEnabled(ctx)) return;
    await run(ctx, async () => {
      const result = await paymentService().verifyRoPayStatus(providerEnvelope(ctx));
      return {
        accepted: true,
        status: result.status,
        idempotent: Boolean(result.idempotent),
      };
    });
  },

  async readRoPayReturn(ctx: any) {
    if (!ropayEnabled(ctx)) return;
    const identity = await statusIdentity(ctx);
    if (!identity) return;
    await run(ctx, async () => safeRoPayStatus(
      await paymentService().readRoPayStatus({
        paymentReference: text(ctx.params?.reference),
        customerDocumentId: identity.customer?.documentId,
        guestCheckoutCapability: identity.guestCheckoutCapability,
      }),
    ));
  },

  async recordBankReceipt(ctx: any) {
    const identity = owner(ctx);
    if (!identity) return;
    const input = requestBody(ctx);
    await run(ctx, () => paymentService().recordBankReceipt({
      ...input,
      paymentDocumentId: text(ctx.params?.documentId),
      actor: identity.actor,
    }));
  },

  async resolvePaymentMismatch(ctx: any) {
    const identity = owner(ctx);
    if (!identity) return;
    const input = requestBody(ctx);
    await run(ctx, () => paymentService().resolvePaymentMismatch({
      ...input,
      paymentDocumentId: text(ctx.params?.documentId),
      actor: identity.actor,
    }));
  },

  async expireDuePayments(ctx: any) {
    if (!owner(ctx)) return;
    const input = requestBody(ctx);
    await run(ctx, async () => ({
      expired: await paymentService().expireDuePayments(
        input.now ? new Date(input.now) : new Date(),
        input.limit ?? 100,
      ),
    }));
  },
};
