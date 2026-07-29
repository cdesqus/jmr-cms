import test from "node:test";
import assert from "node:assert/strict";
import { allowsPurpose, parseConsent } from "./consent.cjs";

test("rejects stale or malformed optional consent", () => {
  assert.equal(parseConsent('{"version":"old","analytics":true}'), null);
  assert.equal(parseConsent("bad-json"), null);
});

test("allows only explicit optional purposes", () => {
  const consent = parseConsent(
    JSON.stringify({
      version: "2026-07-24",
      necessary: true,
      analytics: true,
      lifecycleEmail: false,
      decidedAt: "2026-07-24T10:00:00.000Z",
    }),
  );
  assert.equal(allowsPurpose(consent, "necessary"), true);
  assert.equal(allowsPurpose(consent, "analytics"), true);
  assert.equal(allowsPurpose(consent, "lifecycleEmail"), false);
});
