"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHmac } = require("node:crypto");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeInteger(value, name, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive ? value <= 0 : value < 0)) {
    throw new TypeError(`${name} must be a ${positive ? "positive " : "non-negative "}safe integer.`);
  }
  return value;
}

function safeAdd(left, right, name) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new TypeError(`${name} must be a safe integer.`);
  return result;
}

function safeMultiply(left, right, name) {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new TypeError(`${name} must be a safe integer.`);
  return result;
}

function assertActiveMembership(membership, now) {
  const instant = now instanceof Date ? now : new Date(now ?? Date.now());
  const startsAt = new Date(membership?.startsAt);
  const endsAt = new Date(membership?.endsAt);
  if (
    membership?.status !== "active" ||
    !Number.isFinite(instant.getTime()) ||
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    instant < startsAt ||
    instant >= endsAt
  ) {
    throw new Error("Membership must be active.");
  }
}

function buildMembershipTotals(input) {
  if (!Array.isArray(input?.items) || input.items.length === 0) {
    throw new Error("Membership cart is empty.");
  }
  assertActiveMembership(input.membership, input.now);
  const availableCredits = safeInteger(input.availableCredits, "availableCredits");
  const shippingMinor = safeInteger(input.shippingMinor, "shippingMinor", { positive: true });
  let coveredMerchandiseMinor = 0;
  let creditsRequired = 0;
  for (const item of input.items) {
    if (item?.ordinary === true) throw new Error("Mixed ordinary and redemption carts are not supported.");
    if (item?.eligible !== true) throw new Error("Product is not eligible for membership redemption.");
    const qty = safeInteger(item.qty, "qty", { positive: true });
    const unitPriceMinor = safeInteger(item.unitPriceMinor, "unitPriceMinor");
    const creditCost = safeInteger(item.creditCost, "creditCost", { positive: true });
    coveredMerchandiseMinor = safeAdd(
      coveredMerchandiseMinor,
      safeMultiply(qty, unitPriceMinor, "coveredMerchandiseMinor"),
      "coveredMerchandiseMinor",
    );
    creditsRequired = safeAdd(
      creditsRequired,
      safeMultiply(qty, creditCost, "creditsRequired"),
      "creditsRequired",
    );
  }
  if (creditsRequired > availableCredits) throw new Error("Insufficient membership credits.");
  return {
    merchandiseMinor: 0,
    coveredMerchandiseMinor,
    creditsRequired,
    shippingMinor,
    totalMinor: shippingMinor,
  };
}

function checkoutReference(value) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError("Checkout reference must be an opaque UUID.");
  }
  return value;
}

function opaqueCheckoutReference(secret, customerDocumentId, idempotencyKey) {
  if (![secret, customerDocumentId, idempotencyKey].every((value) =>
    typeof value === "string" && value.trim())) {
    throw new TypeError("Checkout reference identity is required.");
  }
  const digest = createHmac("sha256", secret)
    .update(`${customerDocumentId}\0${idempotencyKey}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function stableKey(key, operation) {
  if (typeof key !== "string" || !key.trim()) throw new TypeError("idempotencyKey is required.");
  return `${key.trim()}:${operation}`;
}

function sameReservation(existing, input) {
  return ["checkoutReference", "customerDocumentId", "membershipDocumentId", "creditsRequired"]
    .every((field) => existing[field] === input[field]);
}

function createMembershipCheckout(adapter) {
  return {
    async reserve(input) {
      checkoutReference(input.checkoutReference);
      safeInteger(input.creditsRequired, "creditsRequired", { positive: true });
      const existing = await adapter.findCheckout(input.checkoutReference);
      if (existing) {
        if (!sameReservation(existing, input)) throw new Error("Checkout idempotency conflict.");
        return existing;
      }
      const stock = await adapter.reserveStock({
        checkoutReference: input.checkoutReference,
        items: input.items,
        idempotencyKey: stableKey(input.idempotencyKey, "stock-reserve"),
      });
      try {
        const credit = await adapter.reserveCredits({
          membershipDocumentId: input.membershipDocumentId,
          checkoutReference: input.checkoutReference,
          credits: input.creditsRequired,
          idempotencyKey: stableKey(input.idempotencyKey, "credit-reserve"),
        });
        return adapter.saveCheckout({
          ...input,
          stockReservationToken: stock.token,
          creditReservationEntryId: credit.entryId,
          status: "reserved",
        });
      } catch (error) {
        await adapter.releaseStock({
          checkoutReference: input.checkoutReference,
          stockReservationToken: stock.token,
          idempotencyKey: stableKey(input.idempotencyKey, "stock-release"),
        });
        throw error;
      }
    },

    async finalize(input) {
      checkoutReference(input.checkoutReference);
      const shippingMinor = safeInteger(input.shippingMinor, "shippingMinor", { positive: true });
      if (input.merchandiseMinor !== 0) throw new Error("Membership merchandise must not be charged.");
      const checkout = await adapter.findCheckout(input.checkoutReference);
      if (!checkout || checkout.status !== "reserved") throw new Error("Checkout reservation not found.");
      let order;
      try {
        order = await adapter.payAndCreateOrder({
          ...input,
          items: checkout.items,
          totalMinor: shippingMinor,
          membershipSnapshot: {
            membershipDocumentId: checkout.membershipDocumentId,
            creditsRedeemed: checkout.creditsRequired,
            coveredMerchandiseMinor: checkout.coveredMerchandiseMinor,
          },
          idempotencyKey: stableKey(input.idempotencyKey, "order"),
        });
      } catch (error) {
        await settleFailure(adapter, checkout, input.idempotencyKey, false);
        throw error;
      }
      await adapter.consumeStock({
        checkoutReference: checkout.checkoutReference,
        stockReservationToken: checkout.stockReservationToken,
        orderDocumentId: order.documentId,
        idempotencyKey: stableKey(input.idempotencyKey, "stock-consume"),
      });
      try {
        await adapter.redeemCredits({
          membershipDocumentId: checkout.membershipDocumentId,
          checkoutReference: checkout.checkoutReference,
          orderDocumentId: order.documentId,
          idempotencyKey: stableKey(input.idempotencyKey, "credit-redeem"),
        });
      } catch (error) {
        await settleFailure(adapter, checkout, input.idempotencyKey, true);
        throw error;
      }
      return adapter.saveCheckout({
        ...checkout,
        orderDocumentId: order.documentId,
        status: "paid",
      });
    },
  };
}

async function settleFailure(adapter, checkout, key, consumed) {
  await adapter.releaseStock({
    checkoutReference: checkout.checkoutReference,
    stockReservationToken: checkout.stockReservationToken,
    consumed,
    idempotencyKey: stableKey(key, consumed ? "stock-reverse" : "stock-release"),
  });
  await adapter.releaseCredits({
    membershipDocumentId: checkout.membershipDocumentId,
    checkoutReference: checkout.checkoutReference,
    idempotencyKey: stableKey(key, "credit-release"),
  });
}

module.exports = {
  buildMembershipTotals,
  checkoutReference,
  createMembershipCheckout,
  opaqueCheckoutReference,
};
