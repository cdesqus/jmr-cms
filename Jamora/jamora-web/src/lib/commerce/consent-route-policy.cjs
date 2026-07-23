"use strict";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function buildStorefrontConsentPayload(input, customer, now = () => new Date()) {
  if (!input || typeof input !== "object" || !UUID.test(input.decisionId)) throw new Error("Invalid decision.");
  if (input.necessary !== true || typeof input.analytics !== "boolean" || typeof input.lifecycleEmail !== "boolean") {
    throw new Error("Explicit purpose states required.");
  }
  const identity = customer
    ? { customerDocumentId: customer.documentId, customerSessionVersion: customer.sessionVersion }
    : UUID.test(input.anonymousSessionId)
      ? { anonymousSessionId: input.anonymousSessionId }
      : null;
  if (!identity) throw new Error("Invalid identity.");
  return {
    decisionId: input.decisionId,
    ...identity,
    purposes: { necessary: true, analytics: input.analytics, lifecycleEmail: input.lifecycleEmail },
    policyVersion: "2026-07-24",
    source: "storefront-consent",
    decidedAt: now().toISOString(),
  };
}
module.exports = { buildStorefrontConsentPayload };
