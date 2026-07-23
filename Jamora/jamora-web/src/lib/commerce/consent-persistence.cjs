"use strict";

function buildConsentDecision(consent, anonymousSessionId, source) {
  return {
    anonymousSessionId,
    purposes: {
      necessary: consent.necessary,
      analytics: consent.analytics,
      lifecycleEmail: consent.lifecycleEmail,
    },
    policyVersion: consent.version,
    source,
    decidedAt: consent.decidedAt,
  };
}

function pendingConsentQueue(queue, decision) {
  return [...queue, decision];
}

module.exports = { buildConsentDecision, pendingConsentQueue };
