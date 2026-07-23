import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsentDecision,
  pendingConsentQueue,
} from "./consent-persistence.cjs";

test("forwards all explicit purpose states with version and source", () => {
  assert.deepEqual(buildConsentDecision({
    version: "2026-07-24",
    necessary: true,
    analytics: false,
    lifecycleEmail: true,
    decidedAt: "2026-07-24T00:00:00.000Z",
  }, "anonymous-1", "cookie-banner"), {
    anonymousSessionId: "anonymous-1",
    purposes: { necessary: true, analytics: false, lifecycleEmail: true },
    policyVersion: "2026-07-24",
    source: "cookie-banner",
    decidedAt: "2026-07-24T00:00:00.000Z",
  });
});

test("failed decisions remain independently retryable without changing consent", () => {
  const consent = { version: "v", necessary: true, analytics: false, lifecycleEmail: false, decidedAt: "now" };
  const queue = pendingConsentQueue([], buildConsentDecision(consent, "a", "cookie-banner"));
  assert.equal(queue.length, 1);
  assert.equal(consent.analytics, false);
});
