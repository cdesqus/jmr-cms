"use strict";

const MAX_PENDING = 20;
function buildConsentDecision(consent, anonymousSessionId, decisionId) {
  return {
    decisionId,
    anonymousSessionId,
    necessary: consent.necessary,
    analytics: consent.analytics,
    lifecycleEmail: consent.lifecycleEmail,
  };
}

function pendingConsentQueue(queue, decision) {
  return [...queue, decision].slice(-MAX_PENDING);
}

function parsePendingConsentQueue(raw) {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.slice(-MAX_PENDING) : [];
  } catch {
    return [];
  }
}
function dispatchConsentPersistenceFailure(dispatch) {
  dispatch("jamora:consent-persistence-failed");
}
module.exports = {
  buildConsentDecision,
  dispatchConsentPersistenceFailure,
  parsePendingConsentQueue,
  pendingConsentQueue,
};
