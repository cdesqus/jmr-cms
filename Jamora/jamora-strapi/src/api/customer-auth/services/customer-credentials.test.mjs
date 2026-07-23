import assert from "node:assert/strict";
import test from "node:test";

import {
  hashOpaqueToken,
  hashPassword,
  issueOpaqueToken,
  verifyPassword,
} from "./customer-credentials.cjs";

test("rejects passwords shorter than 10 characters", async () => {
  await assert.rejects(hashPassword("shortpass"), /at least 10 characters/i);
});

test("password hashes use random salts", async () => {
  assert.notEqual(
    await hashPassword("correct horse"),
    await hashPassword("correct horse"),
  );
});

test("correct passwords verify", async () => {
  assert.equal(
    await verifyPassword("correct horse", await hashPassword("correct horse")),
    true,
  );
});

test("incorrect passwords fail verification", async () => {
  assert.equal(
    await verifyPassword("wrong password", await hashPassword("correct horse")),
    false,
  );
});

test("opaque token hashes are stable and distinct from raw tokens", () => {
  const token = issueOpaqueToken();
  assert.equal(hashOpaqueToken(token), hashOpaqueToken(token));
  assert.notEqual(token, hashOpaqueToken(token));
});
