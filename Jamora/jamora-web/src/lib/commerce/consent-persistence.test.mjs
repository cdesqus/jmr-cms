import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsentDecision,
  dispatchConsentPersistenceFailure,
  parsePendingConsentQueue,
  pendingConsentQueue,
} from "./consent-persistence.cjs";

test("forwards all explicit purpose states with version and source", () => {
  assert.deepEqual(buildConsentDecision({
    version: "2026-07-24",
    necessary: true,
    analytics: false,
    lifecycleEmail: true,
    decidedAt: "2026-07-24T00:00:00.000Z",
  }, "550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001"), {
    decisionId: "550e8400-e29b-41d4-a716-446655440001",
    anonymousSessionId: "550e8400-e29b-41d4-a716-446655440000",
    necessary: true,
    analytics: false,
    lifecycleEmail: true,
  });
});

test("persistence failure notification is always dispatchable", () => {
  const events = [];
  dispatchConsentPersistenceFailure((eventName) => events.push(eventName));
  assert.deepEqual(events, ["jamora:consent-persistence-failed"]);
});

test("failed decisions remain independently retryable without changing consent", () => {
  const consent = { version: "v", necessary: true, analytics: false, lifecycleEmail: false, decidedAt: "now" };
  const queue = pendingConsentQueue([], buildConsentDecision(
    consent,
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001",
  ));
  assert.equal(queue.length, 1);
  assert.equal(consent.analytics, false);
});

test("malformed pending JSON becomes an empty bounded queue", () => {
  assert.deepEqual(parsePendingConsentQueue("{oops"), []);
  let queue = [];
  for (let index = 0; index < 30; index += 1) {
    queue = pendingConsentQueue(queue, { decisionId: String(index) });
  }
  assert.equal(queue.length, 20);
  assert.equal(queue[0].decisionId, "10");
});
