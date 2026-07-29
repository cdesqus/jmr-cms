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

function membershipCartProjection(input) {
  const shippingMinor = safeInteger(input.shippingMinor, "shippingMinor");
  if (input.selected) {
    const covered = safeInteger(input.coveredMerchandiseMinor, "coveredMerchandiseMinor");
    return {
      membership: true,
      merchandiseLabel: "Covered merchandise",
      merchandiseMinor: covered,
      shippingMinor,
      totalMinor: shippingMinor,
    };
  }
  const subtotal = safeInteger(input.subtotalMinor, "subtotalMinor");
  const discount = safeInteger(input.discountMinor ?? 0, "discountMinor");
  return {
    membership: false,
    merchandiseLabel: "Subtotal",
    merchandiseMinor: subtotal,
    shippingMinor,
    discountMinor: discount,
    totalMinor: Math.max(0, subtotal - discount + shippingMinor),
  };
}

module.exports = {
  buildMembershipTotals,
  checkoutReference,
  opaqueCheckoutReference,
  membershipCartProjection,
};
