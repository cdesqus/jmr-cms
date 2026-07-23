// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHmac, timingSafeEqual } = require("node:crypto");

const CUSTOMER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CUSTOMER_SESSION_MAX_AGE_MILLISECONDS =
  CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000;

const sign = (payload, secret) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const validBase64url = (value) => /^[A-Za-z0-9_-]+$/.test(value);

function resolveCustomerSessionSecret(configuredSecret, nodeEnv) {
  if (configuredSecret) return configuredSecret;
  if (nodeEnv === "production") {
    throw new Error("CUSTOMER_SESSION_TOKEN is required in production.");
  }
  return "jamora-customer-dev-session";
}

const validSession = (session, now) =>
  session !== null &&
  typeof session === "object" &&
  typeof session.sub === "string" &&
  session.sub.length > 0 &&
  typeof session.email === "string" &&
  session.email.length > 0 &&
  Number.isInteger(session.sessionVersion) &&
  session.sessionVersion >= 0 &&
  Number.isSafeInteger(session.issuedAt) &&
  Number.isSafeInteger(session.expiresAt) &&
  session.issuedAt <= now &&
  session.expiresAt > now &&
  session.expiresAt - session.issuedAt === CUSTOMER_SESSION_MAX_AGE_MILLISECONDS;

function createSignedCustomerSession(customer, secret, now = Date.now()) {
  if (!secret) throw new Error("CUSTOMER_SESSION_TOKEN is required.");
  const payload = Buffer.from(
    JSON.stringify({
      sub: customer.sub,
      email: customer.email,
      sessionVersion: customer.sessionVersion,
      issuedAt: now,
      expiresAt: now + CUSTOMER_SESSION_MAX_AGE_MILLISECONDS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function readSignedCustomerSession(value, secret, now = Date.now()) {
  if (!value || !secret) return null;
  const parts = value.split(".");
  if (
    parts.length !== 2 ||
    !validBase64url(parts[0]) ||
    !validBase64url(parts[1])
  ) {
    return null;
  }

  const expected = Buffer.from(sign(parts[0], secret), "base64url");
  const actual = Buffer.from(parts[1], "base64url");
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    return validSession(session, now)
      ? {
          sub: session.sub,
          email: session.email,
          sessionVersion: session.sessionVersion,
          issuedAt: session.issuedAt,
          expiresAt: session.expiresAt,
        }
      : null;
  } catch {
    return null;
  }
}

module.exports = {
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  createSignedCustomerSession,
  readSignedCustomerSession,
  resolveCustomerSessionSecret,
};
