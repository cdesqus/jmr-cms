import assert from "node:assert/strict";
import test from "node:test";

import {
  consentRows,
  validateConsentDecision,
} from "./consent-decision.cjs";

test("creates one append-only row per explicit purpose decision", () => {
  const decision = validateConsentDecision({
    anonymousSessionId: " anonymous-123 ",
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
  assert.throws(() => validateConsentDecision({ purposes: {}, policyVersion: "v", source: "x", decidedAt: new Date().toISOString() }));
  assert.throws(() => validateConsentDecision({
    anonymousSessionId: "a", customerDocumentId: "c",
    purposes: {}, policyVersion: "v", source: "x", decidedAt: new Date().toISOString(),
  }));
});

test("withdrawal creates a new denied row rather than an update instruction", () => {
  const rows = consentRows(validateConsentDecision({
    anonymousSessionId: "a",
    purposes: { analytics: false },
    policyVersion: "v2",
    source: "privacy-settings",
    decidedAt: "2026-07-24T00:00:00.000Z",
  }));
  assert.deepEqual(rows, [{
    anonymousSessionId: "a",
    purpose: "analytics",
    granted: false,
    policyVersion: "v2",
    source: "privacy-settings",
    decidedAt: "2026-07-24T00:00:00.000Z",
  }]);
});
