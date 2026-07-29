import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryVisitPrivacyAdapter,
  createVisitPrivacyPurge,
  sanitizeVisitPayload,
} from "./visit-privacy.cjs";

const CAPABILITY = `trk_${"B".repeat(43)}`;

test("Strapi ingestion removes capability-bearing URL data", () => {
  const payload = sanitizeVisitPayload({
    visitorId: "visitor-1",
    path: `/track?q=JM-1&access=${CAPABILITY}`,
    referrer: `https://example.test/orders?token=${CAPABILITY}`,
    userAgent: "Test",
  });

  assert.equal(
    payload.path,
    "/track?q=JM-1&access=%5BREDACTED%5D",
  );
  assert.doesNotMatch(JSON.stringify(payload), /trk_/);
});

test("purge is bounded, resumable, and audits counts without raw URLs", async () => {
  const adapter = createMemoryVisitPrivacyAdapter({
    visits: [
      {
        documentId: "visit-1",
        path: `/track?access=${CAPABILITY}`,
        referrer: "",
      },
      {
        documentId: "visit-2",
        path: "/products?utm_source=email",
        referrer: `https://example.test/?next=${CAPABILITY}`,
      },
      {
        documentId: "visit-3",
        path: "/safe",
        referrer: "",
      },
    ],
  });
  const purge = createVisitPrivacyPurge(adapter);

  const first = await purge.run({ limit: 2, actor: "owner@example.test" });
  assert.deepEqual(first, {
    scanned: 2,
    updated: 2,
    nextCursor: "visit-2",
    complete: false,
  });
  assert.equal(adapter.state.audits.length, 1);
  assert.deepEqual(adapter.state.audits[0].details, first);
  assert.doesNotMatch(
    JSON.stringify([...adapter.state.visits.values()]),
    /trk_/,
  );
  assert.doesNotMatch(JSON.stringify(adapter.state.audits), /trk_/);

  const second = await purge.run({
    cursor: first.nextCursor,
    limit: 2,
    actor: "owner@example.test",
  });
  assert.equal(second.scanned, 1);
  assert.equal(second.updated, 0);
  assert.equal(second.complete, true);
});
