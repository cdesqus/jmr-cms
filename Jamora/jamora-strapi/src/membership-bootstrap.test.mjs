import assert from "node:assert/strict";
import test from "node:test";
import { runMembershipStartupSweeps } from "./membership-bootstrap.cjs";

test("startup runs both bounded membership sweepers and logs counts without PII", async () => {
  const calls = [];
  const messages = [];
  const service = {
    async expireDueMembershipCheckouts(now, limit) {
      calls.push(["checkouts", now, limit]);
      return 2;
    },
    async expireDueMemberships(now, limit) {
      calls.push(["memberships", now, limit]);
      return 3;
    },
  };
  await runMembershipStartupSweeps(service, {
    info: (message) => messages.push(message),
    error: (message) => messages.push(message),
  }, new Date("2026-07-24T00:00:00.000Z"));

  assert.deepEqual(calls.map(([name, , limit]) => [name, limit]), [
    ["checkouts", 100],
    ["memberships", 100],
  ]);
  assert.deepEqual(messages, [
    "Membership checkout expiry sweep processed 2 checkouts",
    "Membership expiry sweep processed 3 memberships",
  ]);
});

test("startup sweep failures are isolated and do not expose error details", async () => {
  const calls = [];
  const messages = [];
  const service = {
    async expireDueMembershipCheckouts() {
      calls.push("checkouts");
      throw new Error("customer@example.test");
    },
    async expireDueMemberships() {
      calls.push("memberships");
      return 1;
    },
  };
  await runMembershipStartupSweeps(service, {
    info: (message) => messages.push(message),
    error: (message) => messages.push(message),
  });

  assert.deepEqual(calls, ["checkouts", "memberships"]);
  assert.deepEqual(messages, [
    "Membership checkout expiry startup sweep failed",
    "Membership expiry sweep processed 1 memberships",
  ]);
});
