"use strict";

const {
  createHmac,
  randomUUID: nodeRandomUUID,
  timingSafeEqual,
} = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { canTransition, normaliseMoney, paymentReference } = require("./payment-domain.cjs");

const CALLBACK_FIELDS = Object.freeze([
  "providerEventId",
  "providerReference",
  "paymentReference",
  "status",
  "amountMinor",
  "currency",
  "occurredAt",
]);
const PROVIDER_STATUSES = new Set(["pending", "paid", "failed"]);
const DEFAULT_TOLERANCE_SECONDS = 300;
const DEFAULT_INTENT_TTL_SECONDS = 600;

function clone(value) {
  return structuredClone(value);
}

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required.`);
  }
  return value.trim();
}

function exactIso(value, name) {
  const text = requiredText(value, name);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new TypeError(`${name} must be an ISO-8601 UTC instant.`);
  }
  return text;
}

function positiveSeconds(value, fallback, name, minimum, maximum) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new TypeError(`${name} must be between ${minimum} and ${maximum} seconds.`);
  }
  return parsed;
}

function assertRoPayEnabled(env, requireSecret = true) {
  if (env.PAYMENTS_ENABLED !== "true" ||
      env.ROPAY_ENABLED !== "true" ||
      (env.ROPAY_PROVIDER_MODE ?? "mock") !== "mock") {
    throw new Error("Not found.");
  }
  if (requireSecret &&
      (typeof env.ROPAY_CALLBACK_SECRET !== "string" ||
       !env.ROPAY_CALLBACK_SECRET.trim())) {
    throw new Error("Not found.");
  }
}

function canonicalPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("RoPay payload is required.");
  }
  const unexpected = Object.keys(payload).filter((field) => !CALLBACK_FIELDS.includes(field));
  if (unexpected.length > 0) {
    throw new TypeError(`RoPay payload has an unexpected field: ${unexpected[0]}.`);
  }
  const providerEventId = requiredText(payload.providerEventId, "providerEventId");
  const providerReference = requiredText(payload.providerReference, "providerReference");
  const callbackPaymentReference = requiredText(payload.paymentReference, "paymentReference");
  const status = requiredText(payload.status, "status").toLowerCase();
  if (!PROVIDER_STATUSES.has(status)) {
    throw new TypeError("RoPay status must be pending, paid, or failed.");
  }
  const money = normaliseMoney(payload);
  if (money.currency !== "RON") {
    throw new TypeError("RoPay currency must be RON.");
  }
  const occurredAt = exactIso(payload.occurredAt, "occurredAt");
  return {
    providerEventId,
    providerReference,
    paymentReference: callbackPaymentReference,
    status,
    amountMinor: money.amountMinor,
    currency: money.currency,
    occurredAt,
  };
}

function canonicalRoPayPayload(payload) {
  return JSON.stringify(canonicalPayload(payload));
}

function verificationFailure() {
  return new Error("RoPay signature verification failed.");
}

function verifySignedPayload(request, options, verification) {
  try {
    const secret = requiredText(options?.secret, "RoPay callback secret");
    const timestamp = exactIso(request?.timestamp, "RoPay timestamp");
    const toleranceSeconds = positiveSeconds(
      options?.toleranceSeconds,
      DEFAULT_TOLERANCE_SECONDS,
      "RoPay timestamp tolerance",
      1,
      900,
    );
    const checkedAt = options?.now instanceof Date
      ? new Date(options.now)
      : new Date(options?.now ?? Date.now());
    if (!Number.isFinite(checkedAt.getTime()) ||
        Math.abs(checkedAt.getTime() - new Date(timestamp).getTime()) >
          toleranceSeconds * 1_000) {
      throw verificationFailure();
    }
    const signature = requiredText(request?.signature, "RoPay signature");
    const match = /^sha256=([a-fA-F0-9]{64})$/.exec(signature);
    if (!match) throw verificationFailure();
    const payload = canonicalPayload(request?.payload);
    const message = `ropay-${verification}\n${timestamp}\n${JSON.stringify(payload)}`;
    const expected = createHmac("sha256", secret).update(message).digest();
    const received = Buffer.from(match[1], "hex");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw verificationFailure();
    }
    if (requiredText(
      request?.providerReference,
      "RoPay provider reference",
    ) !== payload.providerReference) {
      throw verificationFailure();
    }
    return payload;
  } catch {
    throw verificationFailure();
  }
}

function verifyRoPayCallback(request, options = {}) {
  return verifySignedPayload(request, options, "callback");
}

function verifyRoPayStatus(request, options = {}) {
  return verifySignedPayload(request, options, "status");
}

function intentTtlSeconds(env) {
  return positiveSeconds(
    env.ROPAY_INTENT_TTL_SECONDS,
    DEFAULT_INTENT_TTL_SECONDS,
    "ROPAY_INTENT_TTL_SECONDS",
    60,
    900,
  );
}

function replayIdentityMatches(payment, input) {
  if (payment.method !== "ropay" ||
      payment.provider !== "ropay_mock" ||
      payment.currency !== "RON" ||
      payment.subjectType !== input.subjectType ||
      payment.subjectId !== input.subjectId ||
      payment.purpose !== input.purpose) {
    return false;
  }
  if (input.customerDocumentId) {
    return payment.customerDocumentId === input.customerDocumentId &&
      payment.ownerDocumentId === input.customerDocumentId;
  }
  return Boolean(input.guestCheckoutCapability) &&
    payment.ownerDocumentId === `guest:${input.guestCheckoutCapability}`;
}

function providerRequest(payment) {
  return {
    paymentDocumentId: payment.documentId,
    providerReference: payment.providerReference,
    paymentReference: payment.paymentReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    expiresAt: payment.expiresAt,
    sessionToken: requiredText(
      payment.priceSnapshot?.ropay?.sessionToken,
      "RoPay session token",
    ),
  };
}

function providerPresentation(input) {
  const token = requiredText(input.sessionToken, "RoPay session token");
  return {
    qrUrl: `https://mock.ropay.invalid/qr/${token}`,
    deepLink: `ropay://pay/${token}`,
  };
}

function safeIntent(payment, presentation) {
  const expected = providerPresentation(providerRequest(payment));
  if (presentation?.qrUrl !== expected.qrUrl ||
      presentation?.deepLink !== expected.deepLink) {
    throw new Error("RoPay provider presentation is invalid.");
  }
  return {
    method: "ropay",
    status: payment.status,
    paymentReference: payment.paymentReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    expiresAt: payment.expiresAt,
    qrUrl: presentation.qrUrl,
    deepLink: presentation.deepLink,
  };
}

function safeIntentStatus(payment) {
  return {
    method: "ropay",
    status: payment.status,
    paymentReference: payment.paymentReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    expiresAt: payment.expiresAt,
  };
}

async function createRoPayIntent(adapter, input, options = {}) {
  const env = options.env ?? process.env;
  assertRoPayEnabled(env);
  if (Object.prototype.hasOwnProperty.call(input ?? {}, "currency") &&
      (typeof input.currency !== "string" ||
       input.currency.trim().toUpperCase() !== "RON")) {
    throw new TypeError("RoPay currency must be RON.");
  }
  const authoritativeInput = { ...input, currency: "RON" };
  const uuid = options.randomUUID ?? nodeRandomUUID;
  const idempotencyKey = requiredText(
    authoritativeInput.idempotencyKey,
    "idempotencyKey",
  );
  const createdAt = new Date(authoritativeInput.now ?? Date.now());
  if (!Number.isFinite(createdAt.getTime())) throw new TypeError("now is invalid.");
  let payment;
  try {
    payment = await adapter.transaction(async (tx) => {
      const replay = await tx.findPaymentByIdempotency(idempotencyKey);
      if (replay) {
        await tx.listEvents(replay.documentId);
        if (!replayIdentityMatches(replay, authoritativeInput)) {
          throw new Error("RoPay intent idempotency conflict.");
        }
        return replay;
      }
      const resolved = tx.resolvePaymentSubject
        ? await tx.resolvePaymentSubject(authoritativeInput, createdAt)
        : authoritativeInput;
      const money = normaliseMoney(resolved);
      if (money.currency !== "RON") {
        throw new TypeError("RoPay currency must be RON.");
      }
      const subjectType = requiredText(resolved.subjectType, "subjectType");
      const purpose = requiredText(resolved.purpose, "purpose");
      if (!["order", "membership"].includes(subjectType) ||
          !["order", "membership_purchase", "membership_renewal"].includes(purpose) ||
          (subjectType === "membership") !== purpose.startsWith("membership_")) {
        throw new TypeError("Payment subject and purpose do not match.");
      }
      const ownerDocumentId = requiredText(resolved.ownerDocumentId, "ownerDocumentId");
      const priceSnapshot = clone(resolved.priceSnapshot);
      if (!priceSnapshot || typeof priceSnapshot !== "object" || Array.isArray(priceSnapshot)) {
        throw new TypeError("priceSnapshot is required.");
      }
      const requestedExpiry = new Date(
        createdAt.getTime() + intentTtlSeconds(env) * 1_000,
      );
      const subjectExpiry = resolved.subjectExpiresAt
        ? new Date(resolved.subjectExpiresAt)
        : null;
      if (subjectExpiry && !Number.isFinite(subjectExpiry.getTime())) {
        throw new TypeError("subject expiry is invalid.");
      }
      const expiresAtDate = new Date(Math.min(
        requestedExpiry.getTime(),
        subjectExpiry?.getTime() ?? requestedExpiry.getTime(),
      ));
      if (expiresAtDate <= createdAt) {
        throw new Error("RoPay subject expired.");
      }
      const expiresAt = expiresAtDate.toISOString();
      const entropy = uuid();
      const providerEntropy = uuid();
      const sessionToken = uuid().replace(/-/g, "");
      priceSnapshot.ropay = {
        sessionToken,
        displayExpiresAt: expiresAt,
      };
      const data = {
        idempotencyKey,
        subjectType,
        subjectId: requiredText(resolved.subjectId, "subjectId"),
        ownerDocumentId,
        ...(resolved.customerDocumentId
          ? {
              customerDocumentId: requiredText(
                resolved.customerDocumentId,
                "customerDocumentId",
              ),
            }
          : {}),
        purpose,
        amountMinor: money.amountMinor,
        currency: money.currency,
        priceSnapshot,
        ...(resolved.orderDocumentId
          ? { orderDocumentId: requiredText(resolved.orderDocumentId, "orderDocumentId") }
          : {}),
        ...(resolved.membershipDocumentId
          ? {
              membershipDocumentId: requiredText(
                resolved.membershipDocumentId,
                "membershipDocumentId",
              ),
            }
          : {}),
        paymentNumber: `PAY-${entropy.toUpperCase()}`,
        method: "ropay",
        provider: "ropay_mock",
        providerReference: `RPI-${providerEntropy.slice(-12).toUpperCase()}`,
        status: "pending_provider",
        paymentReference: paymentReference("JMR", `ROPAY-${entropy.slice(-12)}`),
        expiresAt,
      };
      const created = await tx.createPayment(data);
      await tx.createEvent({
        eventId: uuid(),
        paymentDocumentId: created.documentId,
        transition: "pending_provider",
        actor: "system",
        payload: { kind: "ropay_intent" },
        providerEventId: `ropay-intent:${idempotencyKey}`,
        occurredAt: createdAt.toISOString(),
      });
      return created;
    });
  } catch (error) {
    const replay = await adapter.transaction(async (tx) => {
      const candidate = await tx.findPaymentByIdempotency(idempotencyKey);
      if (!candidate) return null;
      await tx.listEvents(candidate.documentId);
      if (!replayIdentityMatches(candidate, authoritativeInput)) {
        throw new Error("RoPay intent idempotency conflict.");
      }
      return candidate;
    });
    if (!replay) throw error;
    payment = replay;
  }
  if (payment.status !== "pending_provider") {
    return safeIntentStatus(payment);
  }
  if (new Date(payment.expiresAt) <= createdAt) {
    throw new Error("RoPay intent expired.");
  }
  const createPresentation =
    options.createProviderPresentation ?? providerPresentation;
  const presentation = await createPresentation(providerRequest(payment));
  return safeIntent(payment, presentation);
}

function assertProviderReplay(event, expected) {
  if (event.paymentDocumentId !== expected.paymentDocumentId ||
      event.transition !== expected.transition ||
      event.actor !== "ropay" ||
      !isDeepStrictEqual(event.payload, expected.payload)) {
    throw new Error("RoPay provider event idempotency conflict.");
  }
}

function targetStatus(status) {
  if (status === "pending") return "pending_provider";
  return status;
}

async function handleRoPayCallback(adapter, request, options = {}) {
  const env = options.env ?? process.env;
  assertRoPayEnabled(env);
  const verification = options.verification === "status" ? "status" : "callback";
  const clock = typeof options.now === "function" ? options.now : () => new Date();
  const verified = verification === "status"
    ? verifyRoPayStatus(request, {
        secret: env.ROPAY_CALLBACK_SECRET,
        now: clock(),
        toleranceSeconds: options.toleranceSeconds,
      })
    : verifyRoPayCallback(request, {
        secret: env.ROPAY_CALLBACK_SECRET,
        now: clock(),
        toleranceSeconds: options.toleranceSeconds,
      });
  if (options.authenticatedLimiter) {
    const rateLimit = options.authenticatedLimiter.check(verified);
    if (!rateLimit.allowed) {
      const error = new Error("RoPay request rate limit exceeded.");
      error.statusCode = 429;
      error.retryAfter = rateLimit.retryAfter;
      throw error;
    }
  }
  const uuid = options.randomUUID ?? nodeRandomUUID;
  return adapter.transaction(async (tx) => {
    const payment = await tx.lockPaymentByReference(verified.paymentReference);
    if (!payment) throw new Error("RoPay payment not found.");
    const events = await tx.listEvents(payment.documentId);
    const transition = targetStatus(verified.status);
    const eventPayload = {
      kind: "ropay_provider_event",
      providerEvent: verified,
    };
    if (payment.method !== "ropay" ||
        payment.provider !== "ropay_mock" ||
        payment.paymentReference !== verified.paymentReference ||
        payment.providerReference !== verified.providerReference) {
      throw new Error("RoPay payment reference mismatch.");
    }
    if (payment.amountMinor !== verified.amountMinor ||
        payment.currency !== verified.currency) {
      throw new Error("RoPay payment money mismatch.");
    }
    const replay = events.find(
      (event) => event.providerEventId === verified.providerEventId,
    );
    if (replay) {
      assertProviderReplay(replay, {
        paymentDocumentId: payment.documentId,
        transition,
        payload: eventPayload,
      });
      if ((transition === "paid" &&
           (!["paid", "refunded"].includes(payment.status) ||
            !payment.settlementKey ||
            payment.receivedAmountMinor !== verified.amountMinor ||
            payment.receivedCurrency !== verified.currency)) ||
          (transition === "failed" && payment.status !== "failed") ||
          (transition === "pending_provider" &&
           payment.status !== "pending_provider" &&
           !events.some((event) =>
             event.payload?.kind === "ropay_provider_event" &&
             event.occurredAt > replay.occurredAt))) {
        throw new Error("RoPay provider event idempotency conflict.");
      }
      return { ...payment, idempotent: true };
    }
    const latestRoPayEvent = events
      .filter((event) =>
        event.payload?.kind === "ropay_provider_event" ||
        event.payload?.kind === "ropay_intent")
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
    if (latestRoPayEvent &&
        verified.occurredAt <= latestRoPayEvent.occurredAt) {
      throw new Error("RoPay provider event is out of order.");
    }
    if (transition === "paid" &&
        ["paid", "refunded"].includes(payment.status)) {
      if (!payment.settlementKey ||
          payment.receivedAmountMinor !== verified.amountMinor ||
          payment.receivedCurrency !== verified.currency) {
        throw new Error("RoPay paid state observation conflicts with settlement.");
      }
      await tx.createEvent({
        eventId: uuid(),
        paymentDocumentId: payment.documentId,
        transition: "paid",
        actor: "ropay",
        payload: eventPayload,
        providerEventId: verified.providerEventId,
        occurredAt: verified.occurredAt,
      });
      return { ...payment, idempotent: true };
    }
    if (payment.expiresAt &&
        new Date(verified.occurredAt) >= new Date(payment.expiresAt)) {
      throw new Error("RoPay payment expired before provider confirmation.");
    }
    if (transition === "pending_provider") {
      if (payment.status !== "pending_provider") {
        throw new Error(
          `Payment cannot transition from ${payment.status} to pending_provider.`,
        );
      }
      await tx.createEvent({
        eventId: uuid(),
        paymentDocumentId: payment.documentId,
        transition,
        actor: "ropay",
        payload: eventPayload,
        providerEventId: verified.providerEventId,
        occurredAt: verified.occurredAt,
      });
      return { ...payment, idempotent: false };
    }
    if (!canTransition(payment.status, transition)) {
      throw new Error(`Payment cannot transition from ${payment.status} to ${transition}.`);
    }
    if (transition === "failed") {
      const failed = await tx.updatePayment(payment.documentId, { status: "failed" });
      await tx.createEvent({
        eventId: uuid(),
        paymentDocumentId: payment.documentId,
        transition,
        actor: "ropay",
        payload: eventPayload,
        providerEventId: verified.providerEventId,
        occurredAt: verified.occurredAt,
      });
      return { ...failed, idempotent: false };
    }
    if (tx.validateSettlementSubject) {
      await tx.validateSettlementSubject(payment, {
        occurredAt: verified.occurredAt,
      });
    }
    const settlementKey =
      payment.settlementKey || `payment:${payment.documentId}:settle`;
    const paid = await tx.updatePayment(payment.documentId, {
      status: "paid",
      paidAt: verified.occurredAt,
      receivedAmountMinor: verified.amountMinor,
      receivedCurrency: verified.currency,
      receivedAt: verified.occurredAt,
      settlementKey,
    });
    await tx.createEvent({
      eventId: uuid(),
      paymentDocumentId: payment.documentId,
      transition: "paid",
      actor: "ropay",
      payload: eventPayload,
      providerEventId: verified.providerEventId,
      occurredAt: verified.occurredAt,
    });
    await (options.settleSubject ?? tx.settleSubject ?? (async () => undefined))(
      paid,
      { settlementKey, trx: tx.trx },
    );
    return { ...paid, idempotent: false };
  });
}

async function readRoPayStatus(adapter, input, options = {}) {
  const env = options.env ?? process.env;
  assertRoPayEnabled(env);
  const reference = requiredText(input?.paymentReference, "paymentReference");
  const payment = await adapter.findPaymentByReference(reference);
  if (!payment || payment.method !== "ropay" || payment.provider !== "ropay_mock") {
    throw new Error("RoPay payment not found.");
  }
  const customerDocumentId =
    typeof input?.customerDocumentId === "string"
      ? input.customerDocumentId.trim()
      : "";
  const guestCheckoutCapability =
    typeof input?.guestCheckoutCapability === "string"
      ? input.guestCheckoutCapability.trim()
      : "";
  if ((!customerDocumentId ||
       payment.customerDocumentId !== customerDocumentId ||
       payment.ownerDocumentId !== customerDocumentId) &&
      (!guestCheckoutCapability ||
       payment.ownerDocumentId !== `guest:${guestCheckoutCapability}`)) {
    throw new Error("RoPay payment not found.");
  }
  return {
    method: "ropay",
    status: payment.status,
    paymentReference: payment.paymentReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    expiresAt: payment.expiresAt,
  };
}

module.exports = {
  canonicalRoPayPayload,
  createRoPayIntent,
  handleRoPayCallback,
  readRoPayStatus,
  verifyRoPayCallback,
  verifyRoPayStatus,
};
