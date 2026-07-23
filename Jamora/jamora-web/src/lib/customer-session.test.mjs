import test from "node:test";
import assert from "node:assert/strict";

import {
  createSignedCustomerSession,
  readSignedCustomerSession,
  resolveCustomerSessionSecret,
} from "./customer-session-core.cjs";

const secret = "customer-session-test-secret";
const now = 1_800_000_000_000;
const customer = {
  sub: "customer-document-id",
  email: "customer@example.com",
  sessionVersion: 3,
};

test("creates a signed customer session with a 30-day lifetime", () => {
  const value = createSignedCustomerSession(customer, secret, now);
  assert.deepEqual(readSignedCustomerSession(value, secret, now), {
    ...customer,
    issuedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  });
});

test("signs only the customer session allowlist", () => {
  const value = createSignedCustomerSession(
    { ...customer, role: "admin", passwordHash: "private" },
    secret,
    now,
  );
  assert.deepEqual(readSignedCustomerSession(value, secret, now), {
    ...customer,
    issuedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  });
});

test("rejects a session whose payload was tampered with", () => {
  const value = createSignedCustomerSession(customer, secret, now);
  const [payload, signature] = value.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  decoded.sub = "other-customer";
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");

  assert.equal(
    readSignedCustomerSession(`${tamperedPayload}.${signature}`, secret, now),
    null,
  );
});

test("rejects expired sessions", () => {
  const value = createSignedCustomerSession(customer, secret, now);
  assert.equal(
    readSignedCustomerSession(value, secret, now + 30 * 24 * 60 * 60 * 1000),
    null,
  );
});

test("rejects malformed sessions without throwing", () => {
  for (const value of [
    "",
    "missing-signature",
    "too.many.parts",
    "%%%.$$$",
    `${Buffer.from("{}").toString("base64url")}.short`,
  ]) {
    assert.equal(readSignedCustomerSession(value, secret, now), null);
  }
});

test("rejects payloads with invalid customer session fields", () => {
  const value = createSignedCustomerSession(
    { ...customer, sessionVersion: -1 },
    secret,
    now,
  );
  assert.equal(readSignedCustomerSession(value, secret, now), null);
});

test("allows the fixed fallback only in development", () => {
  assert.equal(
    resolveCustomerSessionSecret(undefined, "development"),
    "jamora-customer-dev-session",
  );
  assert.throws(
    () => resolveCustomerSessionSecret(undefined, "production"),
    /CUSTOMER_SESSION_TOKEN/,
  );
  assert.equal(
    resolveCustomerSessionSecret("configured-secret", "production"),
    "configured-secret",
  );
});
