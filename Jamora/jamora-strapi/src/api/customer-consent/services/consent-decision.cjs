"use strict";

const PURPOSES = {
  necessary: "necessary",
  analytics: "analytics",
  lifecycleEmail: "lifecycle_email",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredString = (value, name) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
};

function validateConsentDecision(input) {
  if (!input || typeof input !== "object") throw new Error("Decision is required.");
  const anonymousSessionId = typeof input.anonymousSessionId === "string"
    ? input.anonymousSessionId.trim() : "";
  const customerDocumentId = typeof input.customerDocumentId === "string"
    ? input.customerDocumentId.trim() : "";
  if (Boolean(anonymousSessionId) === Boolean(customerDocumentId)) {
    throw new Error("Exactly one customer reference is required.");
  }
  if (anonymousSessionId && !UUID.test(anonymousSessionId)) {
    throw new Error("anonymousSessionId must be a UUID.");
  }
  const decisionId = requiredString(input.decisionId, "decisionId");
  if (!UUID.test(decisionId)) throw new Error("decisionId must be a UUID.");
  const decidedAt = requiredString(input.decidedAt, "decidedAt");
  if (!Number.isFinite(Date.parse(decidedAt))) throw new Error("decidedAt must be ISO datetime.");
  const purposes = input.purposes;
  if (!purposes || typeof purposes !== "object") throw new Error("purposes is required.");
  for (const [purpose, granted] of Object.entries(purposes)) {
    if (!(purpose in PURPOSES) || typeof granted !== "boolean") {
      throw new Error("Purpose states must be explicit booleans.");
    }
  }
  if (Object.keys(purposes).length === 0) throw new Error("At least one purpose is required.");
  return {
    decisionId,
    ...(anonymousSessionId ? { anonymousSessionId } : { customerDocumentId }),
    purposes,
    policyVersion: requiredString(input.policyVersion, "policyVersion"),
    source: requiredString(input.source, "source"),
    decidedAt: new Date(decidedAt).toISOString(),
  };
}

function consentRows(decision) {
  const reference = decision.anonymousSessionId
    ? { anonymousSessionId: decision.anonymousSessionId }
    : { customerDocumentId: decision.customerDocumentId };
  return Object.entries(decision.purposes).map(([purpose, granted]) => ({
    decisionId: decision.decisionId,
    decisionPurposeKey: `${decision.decisionId}:${PURPOSES[purpose]}`,
    ...reference,
    purpose: PURPOSES[purpose],
    granted,
    policyVersion: decision.policyVersion,
    source: decision.source,
    decidedAt: decision.decidedAt,
  }));
}

module.exports = { consentRows, validateConsentDecision };
