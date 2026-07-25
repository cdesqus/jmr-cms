"use strict";

const { randomUUID: nodeRandomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const {
  canTransition,
  classifyReceipt,
  normaliseMoney,
  paymentReference,
} = require("./payment-domain.cjs");

const MISMATCH_STATUSES = new Set(["underpaid", "overpaid", "currency_mismatch"]);
const EXPIRABLE_STATUSES = new Set(["awaiting_payment"]);

function assertEnabled(env) {
  if (env.PAYMENTS_ENABLED !== "true") {
    const error = new Error("Not found.");
    error.code = "payments_disabled";
    throw error;
  }
}

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required.`);
  }
  return value.trim();
}

function instant(value, name = "date") {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${name} is invalid.`);
  return date;
}

function iso(value, name) {
  return instant(value, name).toISOString();
}

function ttlSeconds(value) {
  if (value === undefined || value === "") return 72 * 60 * 60;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 300 || parsed > 7 * 24 * 60 * 60) {
    throw new Error("PAYMENT_TRANSFER_TTL_SECONDS must be between 300 and 604800.");
  }
  return parsed;
}

function beneficiaryFromEnv(env = process.env) {
  const name = requiredText(env.PAYMENT_BENEFICIARY_NAME, "beneficiary name");
  const iban = requiredText(env.PAYMENT_BENEFICIARY_IBAN, "beneficiary IBAN")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    throw new TypeError("Beneficiary IBAN is invalid.");
  }
  const bank = typeof env.PAYMENT_BENEFICIARY_BANK === "string"
    ? env.PAYMENT_BENEFICIARY_BANK.trim()
    : "";
  return { name, iban, ...(bank ? { bank } : {}) };
}

function validateGuestCheckoutCapability(reservation, input, now = new Date()) {
  const capability = requiredText(input.guestCheckoutCapability, "guest checkout capability");
  if (!reservation || reservation.token !== capability || reservation.status !== "reserved") {
    throw new Error("Guest checkout capability is invalid.");
  }
  if (input.subjectType !== "order") {
    throw new Error("Guest checkout capability binding is invalid.");
  }
  if (instant(reservation.expiresAt, "reservation expiry") <= instant(now, "now")) {
    throw new Error("Guest checkout capability expired.");
  }
  return `guest:${capability}`;
}

function chargeFromSnapshot(snapshot, currency, fallbackAmount, fallbackCurrency) {
  for (const candidate of [snapshot?.charge, snapshot?.reference]) {
    if (candidate?.currency?.toUpperCase() === currency) {
      return normaliseMoney(candidate);
    }
  }
  if (typeof fallbackCurrency === "string" &&
      fallbackCurrency.toUpperCase() === currency) {
    return normaliseMoney({ amountMinor: fallbackAmount, currency });
  }
  throw new Error(`Authoritative ${currency} price is unavailable.`);
}

function checkoutAggregateMoney(checkout) {
  const totals = checkout?.totals;
  if (!totals || typeof totals !== "object" || Array.isArray(totals)) {
    throw new Error("Membership checkout totals binding is invalid.");
  }
  for (const field of ["merchandiseMinor", "shippingMinor", "totalMinor"]) {
    if (!Number.isSafeInteger(totals[field]) || totals[field] < 0) {
      throw new Error("Membership checkout totals binding is invalid.");
    }
  }
  if (totals.totalMinor !== totals.merchandiseMinor + totals.shippingMinor) {
    throw new Error("Membership checkout totals binding is invalid.");
  }
  return normaliseMoney({
    amountMinor: totals.totalMinor,
    currency: checkout.currency,
  });
}

function assertMembershipCheckoutOrderAggregate(checkout, order, binding) {
  const now = instant(binding.now ?? new Date(), "now");
  if (!checkout || checkout.status !== "reserved") {
    throw new Error("Membership checkout is not reserved.");
  }
  if (instant(checkout.expiresAt, "checkout expiry") <= now) {
    throw new Error("Membership checkout expired.");
  }
  if (checkout.checkoutReference !== binding.checkoutReference ||
      checkout.customerDocumentId !== binding.customerDocumentId ||
      (binding.membershipDocumentId &&
       checkout.membershipDocumentId !== binding.membershipDocumentId)) {
    throw new Error("Membership checkout binding is invalid.");
  }
  const money = checkoutAggregateMoney(checkout);
  if (!order ||
      order.documentId !== binding.orderDocumentId ||
      order.customerDocumentId !== checkout.customerDocumentId ||
      order.checkoutReference !== checkout.checkoutReference ||
      order.membershipDocumentId !== checkout.membershipDocumentId) {
    throw new Error("Membership checkout order binding is invalid.");
  }
  const orderMoney = normaliseMoney({
    amountMinor: order.totalCents,
    currency: order.currency,
  });
  for (const field of ["subtotalCents", "shippingCents", "discountCents"]) {
    if (!Number.isSafeInteger(order[field]) || order[field] < 0) {
      throw new Error("Membership checkout order totals binding is invalid.");
    }
  }
  if (order.subtotalCents !== checkout.totals.merchandiseMinor ||
      order.shippingCents !== checkout.totals.shippingMinor ||
      order.discountCents !== 0 ||
      orderMoney.amountMinor !== money.amountMinor ||
      orderMoney.currency !== money.currency) {
    throw new Error("Membership checkout order totals or currency binding is invalid.");
  }
  return money;
}

function deriveAuthoritativePaymentSubject(
  input,
  subject,
  reservation,
  now = new Date(),
  checkout,
) {
  const subjectType = requiredText(input.subjectType, "subjectType");
  const subjectId = requiredText(input.subjectId, "subjectId");
  const purpose = requiredText(input.purpose, "purpose");
  const currency = normaliseMoney({
    amountMinor: 0,
    currency: checkout ? checkout.currency : input.currency,
  }).currency;
  if (!subject || subject.documentId !== subjectId) {
    throw new Error("Payment subject not found.");
  }

  if (subjectType === "membership") {
    if (!["membership_purchase", "membership_renewal"].includes(purpose) ||
        subject.status !== "pending_payment" ||
        !input.customerDocumentId ||
        subject.customerDocumentId !== input.customerDocumentId) {
      throw new Error("Membership payment subject not found.");
    }
    const expectedRenewal = Boolean(subject.renewalOfMembershipDocumentId);
    if (expectedRenewal !== (purpose === "membership_renewal")) {
      throw new Error("Membership payment purpose is invalid.");
    }
    const amountMinor = currency === "RON"
      ? subject.planSnapshot?.priceRonMinor
      : subject.planSnapshot?.priceEurMinor;
    const money = normaliseMoney({ amountMinor, currency });
    return {
      subjectType,
      subjectId: subject.documentId,
      ownerDocumentId: subject.customerDocumentId,
      customerDocumentId: subject.customerDocumentId,
      purpose,
      membershipDocumentId: subject.documentId,
      ...money,
      priceSnapshot: {
        membershipPlan: clone(subject.planSnapshot),
        charge: money,
      },
    };
  }

  if (subjectType !== "order" || purpose !== "order" || subject.status !== "pending") {
    throw new Error("Order payment subject not found.");
  }
  let ownerDocumentId;
  let subjectExpiresAt;
  if (input.customerDocumentId) {
    if (subject.customerDocumentId !== input.customerDocumentId) {
      throw new Error("Order payment subject not found.");
    }
    ownerDocumentId = subject.customerDocumentId;
  } else {
    ownerDocumentId = validateGuestCheckoutCapability(reservation, input, now);
    if (subject.reservationToken !== reservation.token &&
        subject.checkoutReference !== reservation.token) {
      throw new Error("Guest checkout capability binding is invalid.");
    }
    subjectExpiresAt = iso(reservation.expiresAt, "reservation expiry");
  }
  const checkoutMoney = checkout
    ? assertMembershipCheckoutOrderAggregate(checkout, subject, {
        checkoutReference: input.checkoutReference,
        orderDocumentId: subject.documentId,
        customerDocumentId: input.customerDocumentId,
        membershipDocumentId: input.membershipDocumentId,
        now,
      })
    : null;
  const money = checkoutMoney ?? chargeFromSnapshot(
      subject.priceSnapshot,
      currency,
      subject.totalCents,
      subject.currency,
    );
  const membershipCheckout = checkout
    ? {
        checkoutReference: checkout.checkoutReference,
        customerDocumentId: checkout.customerDocumentId,
        membershipDocumentId: checkout.membershipDocumentId,
        expiresAt: iso(checkout.expiresAt, "checkout expiry"),
        currency: money.currency,
        totals: clone(checkout.totals),
        ...(subject.priceSnapshot?.membershipCheckout?.orderMetadata
          ? {
              orderMetadata:
                clone(subject.priceSnapshot.membershipCheckout.orderMetadata),
            }
          : {}),
      }
    : null;
  return {
    subjectType,
    subjectId: subject.documentId,
    ownerDocumentId,
    ...(subject.customerDocumentId
      ? { customerDocumentId: subject.customerDocumentId }
      : {}),
    purpose,
    orderDocumentId: subject.documentId,
    ...(subject.membershipDocumentId
      ? { membershipDocumentId: subject.membershipDocumentId }
      : {}),
    ...money,
    priceSnapshot: {
      ...clone(subject.priceSnapshot ?? {}),
      ...(membershipCheckout ? { membershipCheckout } : {}),
      charge: money,
    },
    ...(checkout
      ? { subjectExpiresAt: iso(checkout.expiresAt, "checkout expiry") }
      : subjectExpiresAt
        ? { subjectExpiresAt }
        : {}),
  };
}

function assertOrderPaymentBinding(order, payment) {
  const documentId = payment.orderDocumentId || payment.subjectId;
  if (!order || order.documentId !== documentId) {
    throw new Error("Payment order binding is invalid.");
  }
  if (payment.customerDocumentId) {
    if (order.customerDocumentId !== payment.customerDocumentId) {
      throw new Error("Payment order owner binding is invalid.");
    }
    return;
  }
  const owner = requiredText(payment.ownerDocumentId, "ownerDocumentId");
  const capability = owner.startsWith("guest:") ? owner.slice("guest:".length) : "";
  if (!capability ||
      (order.reservationToken !== capability &&
       order.checkoutReference !== capability)) {
    throw new Error("Guest payment order binding is invalid.");
  }
}

async function lockMembershipCheckoutOrder(adapters, binding) {
  const checkoutReference = requiredText(binding.checkoutReference, "checkoutReference");
  const orderDocumentId = requiredText(binding.orderDocumentId, "orderDocumentId");
  const checkout = await adapters.lockCheckout(checkoutReference);
  if (!checkout ||
      (checkout.orderDocumentId &&
       checkout.orderDocumentId !== orderDocumentId)) {
    throw new Error("Membership checkout binding is invalid.");
  }
  const order = await adapters.lockOrder(orderDocumentId);
  assertMembershipCheckoutOrderAggregate(checkout, order, {
    ...binding,
    checkoutReference,
    orderDocumentId,
  });
  return { checkout, order };
}

function authoritativeMembershipCheckoutMarker(order) {
  const snapshot = order?.priceSnapshot?.membershipCheckout;
  const membershipDocumentId = typeof order?.membershipDocumentId === "string"
    ? order.membershipDocumentId.trim()
    : "";
  const marked = Boolean(membershipDocumentId || snapshot);
  if (!marked) return null;
  const checkoutReference = typeof order?.checkoutReference === "string"
    ? order.checkoutReference.trim()
    : "";
  if (!membershipDocumentId || !checkoutReference) {
    throw new Error("Membership checkout marker binding is incomplete.");
  }
  if (snapshot) {
    if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error("Membership checkout marker binding is invalid.");
    }
    const snapshotReference = typeof snapshot.checkoutReference === "string"
      ? snapshot.checkoutReference.trim()
      : "";
    const snapshotMembership = typeof snapshot.membershipDocumentId === "string"
      ? snapshot.membershipDocumentId.trim()
      : membershipDocumentId;
    if (!snapshotReference ||
        snapshotReference !== checkoutReference ||
        snapshotMembership !== membershipDocumentId) {
      throw new Error("Membership checkout marker binding is inconsistent.");
    }
  }
  return { checkoutReference, membershipDocumentId };
}

async function lockAuthoritativeOrderSubject(adapters, binding) {
  const orderDocumentId = requiredText(binding.orderDocumentId, "orderDocumentId");
  const candidate = await adapters.findOrder(orderDocumentId);
  const marker = authoritativeMembershipCheckoutMarker(candidate);
  const rawCallerCheckoutReference = binding.callerCheckoutReference;
  if (rawCallerCheckoutReference !== undefined &&
      (typeof rawCallerCheckoutReference !== "string" ||
       !rawCallerCheckoutReference.trim())) {
    throw new Error("Membership checkout caller binding is invalid.");
  }
  const callerCheckoutReference = rawCallerCheckoutReference?.trim() ?? "";
  if (!marker) {
    if (callerCheckoutReference) {
      throw new Error("Membership checkout reference has no authoritative order binding.");
    }
    const order = await adapters.lockOrder(orderDocumentId);
    if (authoritativeMembershipCheckoutMarker(order)) {
      throw new Error("Authoritative order checkout binding changed.");
    }
    return { order, checkout: null, checkoutReference: null };
  }
  if (callerCheckoutReference &&
      callerCheckoutReference !== marker.checkoutReference) {
    throw new Error("Membership checkout caller binding is invalid.");
  }
  const locked = await lockMembershipCheckoutOrder(adapters, {
    checkoutReference: marker.checkoutReference,
    orderDocumentId,
    customerDocumentId: binding.customerDocumentId,
    membershipDocumentId: marker.membershipDocumentId,
    now: binding.now,
  });
  const lockedMarker = authoritativeMembershipCheckoutMarker(locked.order);
  if (!lockedMarker ||
      lockedMarker.checkoutReference !== marker.checkoutReference ||
      lockedMarker.membershipDocumentId !== marker.membershipDocumentId) {
    throw new Error("Authoritative order checkout binding changed.");
  }
  return {
    ...locked,
    checkoutReference: lockedMarker.checkoutReference,
  };
}

function createPaymentSubjectSettlement(adapters) {
  return async function settleSubject(payment, context) {
    if (payment.purpose === "membership_purchase" ||
        payment.purpose === "membership_renewal") {
      return adapters.activateMembership({
        membershipId: payment.membershipDocumentId || payment.subjectId,
        paymentDocumentId: payment.documentId,
        now: new Date(payment.paidAt),
        idempotencyKey: context.settlementKey,
      });
    }
    if (payment.membershipDocumentId || payment.priceSnapshot?.membershipCheckout) {
      if (payment.orderDocumentId) {
        await adapters.settleOrder(payment, context);
      }
      const snapshot = payment.priceSnapshot?.membershipCheckout ?? {};
      const result = await adapters.finalizeMembershipCheckout({
        customerDocumentId: payment.customerDocumentId,
        checkoutReference: snapshot.checkoutReference || payment.subjectId,
        idempotencyKey: context.settlementKey,
        orderDocumentId: payment.orderDocumentId,
        paymentDocumentId: payment.documentId,
        orderMetadata: snapshot.orderMetadata ?? payment.priceSnapshot?.orderMetadata ?? {},
        now: new Date(payment.paidAt),
      });
      if (!result?.checkout ||
          result.checkout.status !== "paid" ||
          result.checkout.checkoutReference !== (snapshot.checkoutReference || payment.subjectId) ||
          result.checkout.orderDocumentId !== payment.orderDocumentId ||
          result.checkout.settlementKey !== context.settlementKey ||
          !result.order ||
          result.order.status !== "paid" ||
          result.order.documentId !== payment.orderDocumentId ||
          result.order.paymentDocumentId !== payment.documentId) {
        throw new Error("Membership checkout settlement binding is invalid.");
      }
      return result;
    }
    return adapters.settleOrder(payment, context);
  };
}

function positive(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function same(left, right) {
  return isDeepStrictEqual(left ?? null, right ?? null);
}

function comparableSnapshot(snapshot) {
  const copy = clone(snapshot ?? {});
  delete copy.bankTransfer;
  return copy;
}

function assertAuthoritativePaymentSubjectBinding(payment, resolved) {
  for (const field of [
    "subjectType", "subjectId", "ownerDocumentId", "customerDocumentId",
    "purpose", "orderDocumentId", "membershipDocumentId", "amountMinor", "currency",
  ]) {
    if ((resolved[field] ?? null) !== (payment[field] ?? null)) {
      throw new Error("Authoritative payment subject binding changed.");
    }
  }
  if (!same(
    comparableSnapshot(payment.priceSnapshot),
    comparableSnapshot(resolved.priceSnapshot),
  )) {
    throw new Error("Authoritative payment subject binding changed.");
  }
}

function has(input, field) {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function optionalTextIdentity(input, field) {
  if (!has(input, field)) return { provided: false };
  if (typeof input[field] !== "string") {
    throw new TypeError(`${field} must be a string.`);
  }
  return { provided: true, value: input[field].trim() };
}

function instantIdentity(input, fields, fallback) {
  const supplied = fields.find((field) => has(input, field));
  const occurredAt = iso(supplied ? input[supplied] : fallback, fields[0]);
  return {
    occurredAt,
    identity: supplied
      ? { provided: true, field: supplied, value: occurredAt }
      : { provided: false },
  };
}

function assertEventReplay(replay, expected) {
  if (replay.paymentDocumentId !== expected.paymentDocumentId ||
      replay.transition !== expected.transition ||
      replay.actor !== expected.actor ||
      !same(replay.payload, expected.payload)) {
    throw new Error("Payment event idempotency conflict.");
  }
}

function prepareExpected(input, beneficiary) {
  const money = normaliseMoney(input);
  const subjectType = requiredText(input.subjectType, "subjectType");
  if (!["order", "membership"].includes(subjectType)) {
    throw new TypeError("subjectType must be order or membership.");
  }
  const purpose = requiredText(input.purpose, "purpose");
  if (!["order", "membership_purchase", "membership_renewal"].includes(purpose)) {
    throw new TypeError("purpose is invalid.");
  }
  if ((subjectType === "membership") !== purpose.startsWith("membership_")) {
    throw new TypeError("Payment subject and purpose do not match.");
  }
  const ownerDocumentId = requiredText(input.ownerDocumentId, "ownerDocumentId");
  const priceSnapshot = clone(input.priceSnapshot);
  if (!priceSnapshot || typeof priceSnapshot !== "object" || Array.isArray(priceSnapshot)) {
    throw new TypeError("priceSnapshot is required.");
  }
  priceSnapshot.bankTransfer = clone(beneficiary);
  return {
    idempotencyKey: requiredText(input.idempotencyKey, "idempotencyKey"),
    subjectType,
    subjectId: requiredText(input.subjectId, "subjectId"),
    ownerDocumentId,
    ...(input.customerDocumentId
      ? { customerDocumentId: requiredText(input.customerDocumentId, "customerDocumentId") }
      : {}),
    purpose,
    amountMinor: money.amountMinor,
    currency: money.currency,
    priceSnapshot,
    ...(input.orderDocumentId
      ? { orderDocumentId: requiredText(input.orderDocumentId, "orderDocumentId") }
      : {}),
    ...(input.membershipDocumentId
      ? { membershipDocumentId: requiredText(input.membershipDocumentId, "membershipDocumentId") }
      : {}),
  };
}

function assertPreparationReplay(payment, expected) {
  const fields = [
    "idempotencyKey", "subjectType", "subjectId", "ownerDocumentId",
    "customerDocumentId", "purpose", "amountMinor", "currency",
    "orderDocumentId", "membershipDocumentId", "priceSnapshot",
  ];
  if (!fields.every((field) => same(payment[field], expected[field]))) {
    throw new Error("Payment preparation idempotency conflict.");
  }
}

function assertReplayIdentity(payment, input) {
  if (payment.subjectType !== input.subjectType ||
      payment.subjectId !== input.subjectId ||
      payment.purpose !== input.purpose) {
    throw new Error("Payment preparation idempotency conflict.");
  }
  const checkoutReference = typeof input.checkoutReference === "string"
    ? input.checkoutReference.trim()
    : "";
  const storedCheckoutReference =
    payment.priceSnapshot?.membershipCheckout?.checkoutReference;
  if (storedCheckoutReference) {
    if (checkoutReference && storedCheckoutReference !== checkoutReference) {
      throw new Error("Payment preparation idempotency conflict.");
    }
  } else {
    if (checkoutReference ||
        payment.currency !== normaliseMoney({
          amountMinor: 0,
          currency: input.currency,
        }).currency) {
      throw new Error("Payment preparation idempotency conflict.");
    }
  }
  if (input.customerDocumentId) {
    if (payment.ownerDocumentId !== input.customerDocumentId ||
        payment.customerDocumentId !== input.customerDocumentId) {
      throw new Error("Payment preparation idempotency conflict.");
    }
  } else if (input.guestCheckoutCapability &&
      payment.ownerDocumentId !== `guest:${input.guestCheckoutCapability}`) {
    throw new Error("Payment preparation idempotency conflict.");
  }
}

function createPaymentTransactions(adapter, options = {}) {
  const env = options.env ?? process.env;
  const beneficiary = clone(options.beneficiary ?? {});
  const uuid = options.randomUUID ?? nodeRandomUUID;
  const clock = typeof options.now === "function" ? options.now : () => new Date();
  const lifetimeSeconds = ttlSeconds(env.PAYMENT_TRANSFER_TTL_SECONDS);

  async function transactionForPayment(paymentDocumentId, providerEventId, work) {
    return adapter.transaction(async (tx) => {
      const payment = await tx.lockPayment(requiredText(paymentDocumentId, "paymentDocumentId"));
      if (!payment) throw new Error("Payment not found.");
      const events = await tx.listEvents(payment.documentId);
      const replay = providerEventId
        ? events.find((event) => event.providerEventId === providerEventId)
        : undefined;
      return work(tx, payment, events, replay);
    });
  }

  async function settlePaid(tx, payment, eventData) {
    if (tx.validateSettlementSubject) {
      await tx.validateSettlementSubject(payment, {
        occurredAt: eventData.occurredAt,
      });
    }
    const settlementKey = payment.settlementKey || `payment:${payment.documentId}:settle`;
    const paid = await tx.updatePayment(payment.documentId, {
      ...eventData.paymentPatch,
      status: "paid",
      paidAt: eventData.occurredAt,
      settlementKey,
    });
    await tx.createEvent({
      eventId: uuid(),
      paymentDocumentId: payment.documentId,
      transition: "paid",
      actor: eventData.actor,
      ...(eventData.reason ? { reason: eventData.reason } : {}),
      ...(eventData.payload ? { payload: clone(eventData.payload) } : {}),
      ...(eventData.providerEventId ? { providerEventId: eventData.providerEventId } : {}),
      occurredAt: eventData.occurredAt,
    });
    await (options.settleSubject ?? tx.settleSubject ?? (async () => undefined))(
      paid,
      { settlementKey, trx: tx.trx },
    );
    return { ...paid, idempotent: false };
  }

  async function settlePayment(input) {
    assertEnabled(env);
    const actor = requiredText(input.actor, "actor");
    const providerEventId = requiredText(
      input.providerEventId ?? input.idempotencyKey,
      "providerEventId",
    );
    const { occurredAt, identity: occurredAtIdentity } = instantIdentity(
      input,
      ["occurredAt", "receivedAt"],
      clock(),
    );
    const reasonIdentity = optionalTextIdentity(input, "reason");
    const reason = reasonIdentity.value ?? "";
    const providerReferenceIdentity = optionalTextIdentity(input, "providerReference");
    if (providerReferenceIdentity.provided && !providerReferenceIdentity.value) {
      throw new TypeError("providerReference is required when provided.");
    }
    return transactionForPayment(input.paymentDocumentId, providerEventId, async (tx, payment, events, replay) => {
      if (!replay && MISMATCH_STATUSES.has(payment.status)) {
        throw new Error("Owner resolution is required for a payment mismatch.");
      }
      if (!replay &&
          payment.expiresAt &&
          instant(occurredAt, "occurredAt") >= instant(payment.expiresAt, "expiresAt")) {
        throw new Error("Payment expired before settlement.");
      }
      if (!has(input, "receivedAmountMinor") || !has(input, "receivedCurrency")) {
        throw new Error("Settlement received money is required.");
      }
      const received = normaliseMoney({
        amountMinor: input.receivedAmountMinor,
        currency: input.receivedCurrency,
      });
      if (received.amountMinor !== payment.amountMinor ||
          received.currency !== payment.currency) {
        throw new Error("Settlement money mismatch.");
      }
      if ((payment.receivedAmountMinor !== undefined ||
           payment.receivedCurrency !== undefined) &&
          (payment.receivedAmountMinor !== received.amountMinor ||
           payment.receivedCurrency !== received.currency)) {
        throw new Error("Settlement conflicts with recorded receipt money.");
      }
      const providerReference = providerReferenceIdentity.value ?? "";
      const payload = {
        kind: "provider_settlement",
        received,
        occurredAt: occurredAtIdentity,
        providerReference: providerReferenceIdentity,
        reason: reasonIdentity,
      };
      if (replay) {
        assertEventReplay(replay, {
          paymentDocumentId: payment.documentId,
          transition: "paid",
          actor,
          payload,
        });
        if (payment.status !== "paid" ||
            !payment.settlementKey ||
            payment.receivedAmountMinor !== received.amountMinor ||
            payment.receivedCurrency !== received.currency ||
            (providerReferenceIdentity.provided &&
             payment.providerReference !== providerReference)) {
          throw new Error("Payment event idempotency conflict.");
        }
        return { ...payment, idempotent: true };
      }
      if (payment.providerReference && payment.providerReference !== providerReference) {
        throw new Error("Settlement provider reference mismatch.");
      }
      if (payment.status === "paid" && payment.settlementKey) {
        return { ...payment, idempotent: true };
      }
      if (!canTransition(payment.status, "paid")) {
        throw new Error(`Payment cannot transition from ${payment.status} to paid.`);
      }
      return settlePaid(tx, payment, {
        actor,
        providerEventId,
        occurredAt,
        reason,
        payload,
        paymentPatch: {
          ...(payment.receivedAmountMinor === undefined
            ? {
                receivedAmountMinor: received.amountMinor,
                receivedCurrency: received.currency,
                receivedAt: occurredAt,
              }
            : {}),
          ...(providerReference ? { providerReference } : {}),
        },
      });
    });
  }

  return {
    async prepareBankTransfer(input) {
      assertEnabled(env);
      for (const field of ["name", "iban"]) {
        requiredText(beneficiary[field], `beneficiary ${field}`);
      }
      const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey");
      const createdAt = instant(input.now ?? new Date(), "now");
      try {
        return await adapter.transaction(async (tx) => {
          const replay = await tx.findPaymentByIdempotency(idempotencyKey);
          if (replay) {
            await tx.listEvents(replay.documentId);
            assertReplayIdentity(replay, input);
            if (!tx.resolvePaymentSubject) {
              assertPreparationReplay(replay, prepareExpected(input, beneficiary));
            }
            return { ...replay, idempotent: true };
          }
          const resolved = tx.resolvePaymentSubject
            ? await tx.resolvePaymentSubject(input, createdAt)
            : input;
          const expected = prepareExpected({
            ...resolved,
            idempotencyKey,
          }, beneficiary);
          const requestedExpiry = new Date(createdAt.getTime() + lifetimeSeconds * 1_000);
          const subjectExpiry = resolved.subjectExpiresAt
            ? instant(resolved.subjectExpiresAt, "subject expiry")
            : null;
          const expiresAt = new Date(Math.min(
            requestedExpiry.getTime(),
            subjectExpiry?.getTime() ?? requestedExpiry.getTime(),
          )).toISOString();
          const entropy = uuid();
          const data = {
            ...expected,
            paymentNumber: `PAY-${entropy.toUpperCase()}`,
            method: "bank_transfer",
            provider: "manual",
            status: "awaiting_payment",
            paymentReference: paymentReference("JMR", entropy.slice(-12)),
            expiresAt,
          };
          const payment = await tx.createPayment(data);
          await tx.createEvent({
            eventId: uuid(),
            paymentDocumentId: payment.documentId,
            transition: "awaiting_payment",
            actor: "system",
            providerEventId: `prepare:${idempotencyKey}`,
            occurredAt: createdAt.toISOString(),
          });
          return { ...payment, idempotent: false };
        });
      } catch (error) {
        const replay = await adapter.transaction(async (tx) => {
          const payment = await tx.findPaymentByIdempotency(idempotencyKey);
          if (!payment) return null;
          await tx.listEvents(payment.documentId);
          assertReplayIdentity(payment, input);
          if (!tx.resolvePaymentSubject) {
            assertPreparationReplay(payment, prepareExpected(input, beneficiary));
          }
          return { ...payment, idempotent: true };
        });
        if (replay) return replay;
        throw error;
      }
    },

    async recordBankReceipt(input) {
      assertEnabled(env);
      const received = normaliseMoney(input);
      const actor = requiredText(input.actor, "actor");
      const providerEventId = requiredText(
        input.providerEventId ?? input.idempotencyKey,
        "providerEventId",
      );
      const { occurredAt, identity: receivedAtIdentity } = instantIdentity(
        input,
        ["receivedAt"],
        new Date(),
      );
      const bankReferenceIdentity = optionalTextIdentity(input, "bankReference");
      const reason = bankReferenceIdentity.value
        ? `Bank reference: ${bankReferenceIdentity.value}`
        : "";
      const payload = {
        kind: "bank_receipt",
        received,
        receivedAt: receivedAtIdentity,
        bankReference: bankReferenceIdentity,
      };
      return transactionForPayment(input.paymentDocumentId, providerEventId, async (tx, payment, events, replay) => {
        const classification = classifyReceipt(payment, received);
        if (replay) {
          assertEventReplay(replay, {
            paymentDocumentId: payment.documentId,
            transition: classification.status,
            actor,
            payload,
          });
          return { ...payment, idempotent: true };
        }
        if (payment.method !== "bank_transfer") throw new Error("Payment is not a bank transfer.");
        if (MISMATCH_STATUSES.has(payment.status)) {
          throw new Error("Owner resolution is required for a payment mismatch.");
        }
        if (payment.status === "paid" && payment.settlementKey) {
          if (payment.receivedAmountMinor !== received.amountMinor ||
              payment.receivedCurrency !== received.currency) {
            throw new Error("Payment is already settled with different receipt money.");
          }
          return { ...payment, idempotent: true };
        }
        if (payment.expiresAt && instant(occurredAt, "receivedAt") >= instant(payment.expiresAt, "expiresAt")) {
          throw new Error("Payment expired before the receipt was received.");
        }
        if (!canTransition(payment.status, classification.status)) {
          throw new Error(`Payment cannot transition from ${payment.status} to ${classification.status}.`);
        }
        const paymentPatch = {
          receivedAmountMinor: received.amountMinor,
          receivedCurrency: received.currency,
          receivedAt: occurredAt,
        };
        if (classification.status === "paid") {
          return settlePaid(tx, payment, {
            actor,
            providerEventId,
            occurredAt,
            reason,
            payload,
            paymentPatch,
          });
        }
        const updated = await tx.updatePayment(payment.documentId, {
          ...paymentPatch,
          status: classification.status,
        });
        await tx.createEvent({
          eventId: uuid(),
          paymentDocumentId: payment.documentId,
          transition: classification.status,
          actor,
          ...(reason ? { reason } : {}),
          payload,
          providerEventId,
          occurredAt,
        });
        return { ...updated, idempotent: false, differenceMinor: classification.differenceMinor };
      });
    },

    async resolvePaymentMismatch(input) {
      assertEnabled(env);
      const actor = requiredText(input.actor, "actor");
      const reason = requiredText(input.reason, "reason");
      const providerEventId = requiredText(
        input.providerEventId ?? input.idempotencyKey,
        "idempotencyKey",
      );
      const { occurredAt, identity: occurredAtIdentity } = instantIdentity(
        input,
        ["occurredAt"],
        new Date(),
      );
      const resolution = input.resolution ?? "accept";
      if (!["accept", "cancel"].includes(resolution)) {
        throw new TypeError("resolution must be accept or cancel.");
      }
      return transactionForPayment(input.paymentDocumentId, providerEventId, async (tx, payment, events, replay) => {
        const target = resolution === "accept" ? "paid" : "cancelled";
        const payload = {
          kind: "mismatch_resolution",
          resolution: {
            provided: has(input, "resolution"),
            value: resolution,
          },
          occurredAt: occurredAtIdentity,
          reason: { provided: true, value: reason },
        };
        if (replay) {
          assertEventReplay(replay, {
            paymentDocumentId: payment.documentId,
            transition: target,
            actor,
            payload,
          });
          return { ...payment, idempotent: true };
        }
        if (!MISMATCH_STATUSES.has(payment.status)) {
          if (payment.status === target && (target !== "paid" || payment.settlementKey)) {
            return { ...payment, idempotent: true };
          }
          throw new Error("Payment is not awaiting mismatch resolution.");
        }
        if (!canTransition(payment.status, target)) {
          throw new Error(`Payment cannot transition from ${payment.status} to ${target}.`);
        }
        if (target === "paid") {
          return settlePaid(tx, payment, {
            actor,
            providerEventId,
            occurredAt,
            reason,
            payload,
            paymentPatch: {},
          });
        }
        const updated = await tx.updatePayment(payment.documentId, { status: "cancelled" });
        await tx.createEvent({
          eventId: uuid(),
          paymentDocumentId: payment.documentId,
          transition: "cancelled",
          actor,
          reason,
          payload,
          providerEventId,
          occurredAt,
        });
        return { ...updated, idempotent: false };
      });
    },

    settlePayment,

    async expireDuePayments(now = new Date(), limit = 100) {
      assertEnabled(env);
      const bounded = Math.min(positive(limit, "limit"), 100);
      const at = instant(now, "now");
      const due = await adapter.findDuePayments(at, bounded);
      let count = 0;
      for (const candidate of due) {
        const expired = await adapter.transaction(async (tx) => {
          const payment = await tx.lockPayment(candidate.documentId);
          if (!payment) return false;
          const events = await tx.listEvents(payment.documentId);
          if (!EXPIRABLE_STATUSES.has(payment.status) ||
              !payment.expiresAt ||
              instant(payment.expiresAt, "expiresAt") > at) {
            return false;
          }
          const providerEventId = `expiry:${payment.documentId}`;
          if (events.some((event) => event.providerEventId === providerEventId)) return false;
          if (!canTransition(payment.status, "expired")) {
            throw new Error(`Payment cannot transition from ${payment.status} to expired.`);
          }
          await tx.updatePayment(payment.documentId, { status: "expired" });
          await tx.createEvent({
            eventId: uuid(),
            paymentDocumentId: payment.documentId,
            transition: "expired",
            actor: "system",
            providerEventId,
            occurredAt: at.toISOString(),
          });
          return true;
        });
        if (expired) count += 1;
      }
      return count;
    },
  };
}

function createMemoryPaymentAdapter(options = {}) {
  const adapter = {
    payments: new Map((options.payments ?? []).map((payment) => [payment.documentId, clone(payment)])),
    events: clone(options.events ?? []),
    queue: Promise.resolve(),
    findDuePayments: async (now, limit) => [...adapter.payments.values()]
      .filter((payment) => EXPIRABLE_STATUSES.has(payment.status) &&
        payment.expiresAt && instant(payment.expiresAt) <= now)
      .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
      .slice(0, limit)
      .map(clone),
    async transaction(work) {
      const prior = adapter.queue;
      let release;
      adapter.queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const paymentSnapshot = clone([...adapter.payments]);
      const eventSnapshot = clone(adapter.events);
      try {
        return await work(memoryTransaction(adapter, options));
      } catch (error) {
        adapter.payments = new Map(paymentSnapshot);
        adapter.events = eventSnapshot;
        throw error;
      } finally {
        release();
      }
    },
  };
  return adapter;
}

function memoryTransaction(adapter, options) {
  const findByIdempotency = (key) =>
    [...adapter.payments.values()].find((payment) => payment.idempotencyKey === key);
  return {
    trx: undefined,
    findPaymentByIdempotency: async (key) => clone(findByIdempotency(key)),
    lockPayment: async (documentId) => clone(adapter.payments.get(documentId)),
    listEvents: async (paymentDocumentId) =>
      clone(adapter.events.filter((event) => event.paymentDocumentId === paymentDocumentId)),
    async createPayment(data) {
      if (findByIdempotency(data.idempotencyKey)) throw new Error("unique payment idempotency conflict");
      if ([...adapter.payments.values()].some((payment) => payment.paymentReference === data.paymentReference)) {
        throw new Error("unique payment reference conflict");
      }
      const payment = {
        ...clone(data),
        documentId: `payment:${data.paymentNumber}`,
      };
      adapter.payments.set(payment.documentId, payment);
      return clone(payment);
    },
    async updatePayment(documentId, patch) {
      const current = adapter.payments.get(documentId);
      if (!current) throw new Error("Payment not found.");
      Object.assign(current, clone(patch));
      return clone(current);
    },
    async createEvent(data) {
      if (adapter.events.some((event) => event.eventId === data.eventId ||
          (data.providerEventId && event.providerEventId === data.providerEventId))) {
        throw new Error("unique payment event conflict");
      }
      adapter.events.push(clone(data));
      return clone(data);
    },
    ...(options.resolvePaymentSubject
      ? { resolvePaymentSubject: options.resolvePaymentSubject }
      : {}),
    ...(options.validateSettlementSubject
      ? { validateSettlementSubject: options.validateSettlementSubject }
      : {}),
    ...(options.settleSubject ? { settleSubject: options.settleSubject } : {}),
  };
}

function createStrapiPaymentAdapter(strapi, options = {}) {
  const paymentQuery = () => strapi.db.query("api::payment.payment");
  const eventQuery = () => strapi.db.query("api::payment-event.payment-event");
  const withTransaction = (trx, value) => ({ ...value, transacting: trx });
  const findPaymentByIdempotency = (key, trx) =>
    paymentQuery().findOne(withTransaction(trx, { where: { idempotencyKey: key } }));
  return {
    findDuePayments: (now, limit) => paymentQuery().findMany({
      where: {
        status: { $in: [...EXPIRABLE_STATUSES] },
        expiresAt: { $lte: now.toISOString() },
      },
      orderBy: { expiresAt: "asc" },
      limit,
    }),
    transaction: (work) => strapi.db.transaction(async ({ trx }) => work({
      trx,
      findPaymentByIdempotency: (key) => findPaymentByIdempotency(key, trx),
      async lockPayment(documentId) {
        await strapi.db.connection("payments")
          .where({ document_id: documentId })
          .transacting(trx)
          .forUpdate()
          .first();
        return paymentQuery().findOne(withTransaction(trx, { where: { documentId } }));
      },
      listEvents: (paymentDocumentId) => eventQuery().findMany(withTransaction(trx, {
        where: { paymentDocumentId },
        orderBy: { occurredAt: "asc" },
      })),
      createPayment: (data) => paymentQuery().create(withTransaction(trx, { data })),
      updatePayment: (documentId, data) => paymentQuery().update(withTransaction(trx, {
        where: { documentId },
        data,
      })),
      createEvent: (data) => eventQuery().create(withTransaction(trx, { data })),
      ...(options.resolvePaymentSubject
        ? {
            resolvePaymentSubject: (input, now) =>
              options.resolvePaymentSubject(input, { trx, now }),
          }
        : {}),
      ...(options.validateSettlementSubject
        ? {
            validateSettlementSubject: (payment, context = {}) =>
              options.validateSettlementSubject(payment, { ...context, trx }),
          }
        : {}),
      ...(options.settleSubject
        ? { settleSubject: (payment, context) => options.settleSubject(payment, { ...context, trx }) }
        : {}),
    })),
  };
}

module.exports = {
  assertAuthoritativePaymentSubjectBinding,
  assertOrderPaymentBinding,
  beneficiaryFromEnv,
  createMemoryPaymentAdapter,
  createPaymentSubjectSettlement,
  createPaymentTransactions,
  createStrapiPaymentAdapter,
  deriveAuthoritativePaymentSubject,
  lockAuthoritativeOrderSubject,
  lockMembershipCheckoutOrder,
  ttlSeconds,
  validateGuestCheckoutCapability,
};
