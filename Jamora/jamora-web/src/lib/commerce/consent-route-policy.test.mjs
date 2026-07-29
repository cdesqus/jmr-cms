import assert from "node:assert/strict";
import test from "node:test";
import { buildStorefrontConsentPayload } from "./consent-route-policy.cjs";

test("server owns identity and consent metadata and discards browser deputy fields", () => {
  const payload = buildStorefrontConsentPayload({
    decisionId: "550e8400-e29b-41d4-a716-446655440001",
    anonymousSessionId: "550e8400-e29b-41d4-a716-446655440000",
    necessary: true,
    analytics: false,
    lifecycleEmail: true,
    customerDocumentId: "attacker",
    source: "attacker",
    policyVersion: "attacker",
    decidedAt: "2000-01-01T00:00:00.000Z",
  }, null, () => new Date("2026-07-24T12:00:00.000Z"));
  assert.deepEqual(payload, {
    decisionId: "550e8400-e29b-41d4-a716-446655440001",
    anonymousSessionId: "550e8400-e29b-41d4-a716-446655440000",
    purposes: { necessary: true, analytics: false, lifecycleEmail: true },
    policyVersion: "2026-07-24",
    source: "storefront-consent",
    decidedAt: "2026-07-24T12:00:00.000Z",
  });
});

test("requires UUID identity, UUID decision, necessary true, and optional booleans", () => {
  assert.throws(() => buildStorefrontConsentPayload({
    decisionId: "bad", anonymousSessionId: "bad", necessary: false,
    analytics: false, lifecycleEmail: false,
  }, null));
});
