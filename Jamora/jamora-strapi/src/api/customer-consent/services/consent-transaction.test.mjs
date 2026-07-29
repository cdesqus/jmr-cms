import assert from "node:assert/strict";
import test from "node:test";
import { persistConsentRows } from "./consent-transaction.cjs";

const rows = ["necessary", "analytics", "lifecycle_email"].map((purpose) => ({
  decisionId: "d1", decisionPurposeKey: `d1:${purpose}`, purpose,
}));

test("response-loss retry returns the existing coherent decision", async () => {
  const stored = [];
  const adapter = {
    find: async () => stored.filter((row) => row.decisionId === "d1"),
    transaction: async (work) => work({ create: async (row) => stored.push(row) }),
  };
  assert.equal((await persistConsentRows(adapter, rows)).created, true);
  assert.equal((await persistConsentRows(adapter, rows)).created, false);
  assert.equal(stored.length, 3);
});

test("mid-transaction failure rolls back all purposes", async () => {
  const stored = [];
  const adapter = {
    find: async () => [],
    transaction: async (work) => {
      const pending = [];
      await work({ create: async (row) => {
        if (row.purpose === "analytics") throw new Error("injected");
        pending.push(row);
      } });
      stored.push(...pending);
    },
  };
  await assert.rejects(persistConsentRows(adapter, rows), /injected/);
  assert.equal(stored.length, 0);
});
