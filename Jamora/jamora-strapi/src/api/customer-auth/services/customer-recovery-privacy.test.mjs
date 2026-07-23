import assert from "node:assert/strict";
import test from "node:test";

import createCustomerAuth, {
  CustomerAuthError,
} from "./customer-auth.ts";
import { hashOpaqueToken } from "./customer-credentials.cjs";
import {
  createRecoveryTokenWork,
  runRecoveryPrivacyWork,
  waitForRecoveryPrivacyFloor,
} from "./customer-recovery-privacy.cjs";

test("recovery token work always creates a raw token and stable hash", () => {
  const first = createRecoveryTokenWork();
  const second = createRecoveryTokenWork();
  assert.ok(first.token);
  assert.ok(first.tokenHash);
  assert.notEqual(first.token, first.tokenHash);
  assert.equal(first.tokenHash, hashOpaqueToken(first.token));
  assert.notEqual(first.token, second.token);
});

test("privacy floor waits only for the remaining duration", async () => {
  const waits = [];
  await waitForRecoveryPrivacyFloor(1_000, {
    minimumMs: 250,
    now: () => 1_075,
    sleep: async (milliseconds) => waits.push(milliseconds),
  });
  assert.deepEqual(waits, [175]);
});

test("privacy floor performs no extra wait after the minimum", async () => {
  const waits = [];
  await waitForRecoveryPrivacyFloor(1_000, {
    minimumMs: 250,
    now: () => 1_300,
    sleep: async (milliseconds) => waits.push(milliseconds),
  });
  assert.deepEqual(waits, []);
});

test("recovery privacy work is identical for early and updated branches", async () => {
  const events = [];
  const dependencies = {
    now: () => 100,
    createTokenWork: () => {
      events.push("token");
      return { token: "raw", tokenHash: "hash" };
    },
    waitForFloor: async (startedAt) => events.push(`wait:${startedAt}`),
  };
  const early = await runRecoveryPrivacyWork(
    async () => {
      events.push("early");
      return { accepted: true };
    },
    dependencies,
  );
  const updated = await runRecoveryPrivacyWork(
    async ({ tokenHash }) => {
      events.push(`updated:${tokenHash}`);
      return { accepted: true };
    },
    dependencies,
  );
  assert.deepEqual(early, { accepted: true });
  assert.deepEqual(updated, { accepted: true });
  assert.deepEqual(events, [
    "token", "early", "wait:100",
    "token", "updated:hash", "wait:100",
  ]);
});

test("expired recovery token is rejected", async () => {
  const queries = [];
  const strapi = {
    documents: () => ({
      findMany: async (query) => {
        queries.push(query);
        return [];
      },
    }),
  };
  const service = createCustomerAuth({ strapi });
  await assert.rejects(
    service.resetPassword("expired-token", "a secure password"),
    (error) =>
      error instanceof CustomerAuthError && error.code === "invalid_token",
  );
  assert.equal(
    typeof queries[0].filters.resetExpiresAt.$gt,
    "string",
  );
  assert.equal(
    Number.isNaN(Date.parse(queries[0].filters.resetExpiresAt.$gt)),
    false,
  );
});

test("production password recovery suppresses the raw token", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const updates = [];
  const strapi = {
    documents: () => ({
      findMany: async () => [{ documentId: "customer-1", active: true }],
      update: async (input) => updates.push(input),
    }),
  };
  try {
    const result = await createCustomerAuth({ strapi }).requestPasswordReset(
      "customer@example.com",
    );
    assert.deepEqual(result, { accepted: true });
    assert.equal(updates.length, 1);
    assert.ok(updates[0].data.resetTokenHash);
    assert.equal("resetToken" in updates[0].data, false);
  } finally {
    process.env.NODE_ENV = previous;
  }
});
