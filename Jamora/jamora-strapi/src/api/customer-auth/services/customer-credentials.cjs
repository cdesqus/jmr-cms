"use strict";

const {
  createHash,
  randomBytes,
  scrypt: scryptCallback,
  timingSafeEqual,
} = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(scryptCallback);
const MINIMUM_PASSWORD_LENGTH = 10;

async function hashPassword(password) {
  if (typeof password !== "string" || password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error("Password must be at least 10 characters.");
  }

  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;

  const [algorithm, saltValue, hashValue, extra] = stored.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue || extra !== undefined) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await scrypt(password, salt, 64);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function issueOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

function hashOpaqueToken(token) {
  return createHash("sha256").update(token).digest("base64url");
}

module.exports = {
  hashOpaqueToken,
  hashPassword,
  issueOpaqueToken,
  verifyPassword,
};
