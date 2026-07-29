import assert from "node:assert/strict";
import test from "node:test";

import {
  consentRows,
  validateConsentDecision,
} from "./consent-decision.cjs";

test("creates one append-only row per explicit purpose decision", () => {
  const decision = validateConsentDecision({
    decisionId: "550e8400-e29b-41d4-a716-446655440001",
    anonymousSessionId: "550e8400-e29b-41d4-a716-446655440000",
    purposes: { necessary: true, analytics: false, lifecycleEmail: true },
    policyVersion: "2026-07-24",
    source: "cookie-banner",
    decidedAt: "2026-07-24T00:00:00.000Z",
  });
  const rows = consentRows(decision);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ purpose, granted }) => ({ purpose, granted })), [
    { purpose: "necessary", granted: true },
    { purpose: "analytics", granted: false },
    { purpose: "lifecycle_email", granted: true },
  ]);
});

test("requires exactly one anonymous or verified customer reference", () => {
  assert.throws(() => validateConsentDecision({ decisionId: "550e8400-e29b-41d4-a716-446655440001", purposes: {}, policyVersion: "v", source: "x", decidedAt: new Date().toISOString() }));
  assert.throws(() => validateConsentDecision({
    decisionId: "550e8400-e29b-41d4-a716-446655440001", anonymousSessionId: "550e8400-e29b-41d4-a716-446655440000", customerDocumentId: "c",
    purposes: {}, policyVersion: "v", source: "x", decidedAt: new Date().toISOString(),
  }));
});

test("withdrawal creates a new denied row rather than an update instruction", () => {
  const rows = consentRows(validateConsentDecision({
    decisionId: "550e8400-e29b-41d4-a716-446655440001",
    anonymousSessionId: "550e8400-e29b-41d4-a716-446655440000",
    purposes: { analytics: false },
    policyVersion: "v2",
    source: "privacy-settings",
    decidedAt: "2026-07-24T00:00:00.000Z",
  }));
  assert.deepEqual(rows, [{
    decisionId: "550e8400-e29b-41d4-a716-446655440001",
    decisionPurposeKey: "550e8400-e29b-41d4-a716-446655440001:analytics",
    anonymousSessionId: "550e8400-e29b-41d4-a716-446655440000",
    purpose: "analytics",
    granted: false,
    policyVersion: "v2",
    source: "privacy-settings",
    decidedAt: "2026-07-24T00:00:00.000Z",
  }]);
});
