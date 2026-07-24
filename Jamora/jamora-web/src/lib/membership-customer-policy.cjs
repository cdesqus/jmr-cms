"use strict";

const ROUTES = new Map([
  ["GET:plans", "/api/jamora/membership/plans"],
  ["GET:me", "/api/jamora/membership/me"],
  ["POST:purchase", "/api/jamora/membership/purchase"],
  ["POST:renew", "/api/jamora/membership/renew"],
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function customerMembershipPath(method, path) {
  if (!Array.isArray(path) || path.length !== 1) throw new Error("Not found.");
  const target = ROUTES.get(`${method}:${path[0]}`);
  if (!target) throw new Error("Not found.");
  return target;
}

function membershipCustomerBoundary(env, customer) {
  if (env.MEMBERSHIP_ENABLED !== "true") return { status: 404, error: "Not found." };
  if (!customer) return { status: 401, error: "Authentication required." };
  return null;
}

function membershipOperationBody(operation, input) {
  if (!input || typeof input !== "object") throw new Error("Invalid request.");
  const planDocumentId = text(input.planDocumentId);
  const idempotencyKey = text(input.idempotencyKey);
  if (!planDocumentId || !idempotencyKey || idempotencyKey.length > 200) {
    throw new Error("Invalid request.");
  }
  if (operation === "purchase") return { planDocumentId, idempotencyKey };
  if (operation === "renew") {
    const membershipDocumentId = text(input.membershipDocumentId);
    if (!membershipDocumentId) throw new Error("Invalid request.");
    return { planDocumentId, membershipDocumentId, idempotencyKey };
  }
  throw new Error("Invalid request.");
}

function safeCredits(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid membership ledger.");
  return value;
}

function membershipDashboard(membership) {
  if (!Array.isArray(membership?.creditEntries)) {
    throw new Error("Authoritative membership ledger is unavailable.");
  }
  let remaining = 0;
  let reserved = 0;
  let redeemed = 0;
  let expired = 0;
  for (const entry of membership.creditEntries) {
    const credits = safeCredits(entry.credits ?? 0);
    if (entry.kind === "grant") remaining += credits;
    else if (entry.kind === "release" || entry.kind === "reverse") {
      remaining += credits;
      reserved -= credits;
    }
    else if (entry.kind === "reserve") { remaining -= credits; reserved += credits; }
    else if (entry.kind === "redeem") { reserved -= credits; redeemed += credits; }
    else if (entry.kind === "expire") { remaining -= credits; expired += credits; }
    else if (entry.kind === "admin_adjustment") {
      if (!Number.isSafeInteger(entry.creditDelta) || entry.creditDelta === 0) {
        throw new Error("Invalid membership ledger.");
      }
      remaining += entry.creditDelta;
    }
    else throw new Error("Invalid membership ledger.");
    if (![remaining, reserved, redeemed, expired].every(Number.isSafeInteger)) {
      throw new Error("Invalid membership ledger.");
    }
  }
  const state = membership.status === "pending_payment"
    ? "pending"
    : membership.status === "active"
      ? "active"
      : membership.status === "expired"
        ? "expired"
        : membership.status;
  return {
    ...membership,
    state,
    totals: { remaining, reserved, redeemed, expired },
    canRedeem: state === "active" && remaining > 0,
  };
}

module.exports = {
  customerMembershipPath,
  membershipCustomerBoundary,
  membershipDashboard,
  membershipOperationBody,
};
