import assert from "node:assert/strict";
import test from "node:test";

import {
  claimCustomerTrackingCapability,
  createMemoryTrackingCapabilityAdapter,
  manageTrackingCapabilities,
  reissueLegacyTrackingCapabilities,
  trackingCapabilityReissueLimit,
} from "./tracking-capability-reissue.cjs";

const now = new Date("2026-07-29T08:00:00.000Z");
const storefrontUrl = "https://shop.example.test";

function entropy(byte = 7) {
  return () => Buffer.alloc(32, byte);
}

function eligibleFixture(extra = {}) {
  return {
    orders: [{
      documentId: "order-verified",
      orderNumber: "JMR-VERIFIED",
      email: "ana@example.test",
      customerDocumentId: "customer-verified",
      trackingCapabilityHash: null,
      trackingCapabilityStatus: null,
      trackingCapabilityVersion: 0,
      ...extra,
    }],
    customers: [{
      documentId: "customer-verified",
      email: "ana@example.test",
      active: true,
      emailVerifiedAt: "2026-07-01T00:00:00.000Z",
    }],
  };
}

test("legacy backfill stores only safe pending-delivery metadata and never raw capability", async () => {
  const fixture = eligibleFixture();
  fixture.orders.push({
    documentId: "order-existing",
    orderNumber: "JMR-EXISTING",
    email: "ana@example.test",
    customerDocumentId: "customer-verified",
    trackingCapabilityHash: "a".repeat(64),
    trackingCapabilityStatus: "active",
    trackingCapabilityVersion: 2,
  });
  const adapter = createMemoryTrackingCapabilityAdapter(fixture);
  const result = await reissueLegacyTrackingCapabilities({
    adapter,
    actor: "owner@example.test",
    limit: 1,
    storefrontUrl,
    now,
  });

  assert.deepEqual(result, {
    selected: 1,
    queued: 1,
    skippedIneligible: 0,
    skippedConcurrent: 0,
    remainingUnreviewed: 0,
  });
  assert.deepEqual(adapter.orders.get("order-verified"), {
    ...eligibleFixture().orders[0],
    trackingPreviewUrl: null,
    trackingCapabilityStatus: "pending_delivery",
    trackingCapabilityReviewedAt: now.toISOString(),
  });
  assert.equal(JSON.stringify(adapter.orders).includes("trk_"), false);
  assert.equal(JSON.stringify(adapter.audits).includes("trk_"), false);
  assert.equal(
    adapter.orders.get("order-existing").trackingCapabilityHash,
    "a".repeat(64),
  );
});

test("verified customer claim atomically stores only digest and returns raw URL once", async () => {
  const adapter = createMemoryTrackingCapabilityAdapter(eligibleFixture({
    trackingCapabilityStatus: "pending_delivery",
    trackingCapabilityReviewedAt: now.toISOString(),
  }));
  const claimed = await claimCustomerTrackingCapability({
    adapter,
    customerDocumentId: "customer-verified",
    orderDocumentId: "order-verified",
    storefrontUrl,
    randomBytes: entropy(),
    now,
  });

  assert.match(
    claimed.trackingUrl,
    /^https:\/\/shop\.example\.test\/track\?order=JMR-VERIFIED&access=trk_[A-Za-z0-9_-]{43}$/,
  );
  assert.deepEqual(Object.keys(claimed).sort(), ["orderNumber", "trackingUrl"]);
  const stored = adapter.orders.get("order-verified");
  assert.match(stored.trackingCapabilityHash, /^[a-f0-9]{64}$/);
  assert.equal(stored.trackingCapabilityStatus, "active");
  assert.equal(JSON.stringify(stored).includes("trk_"), false);
  assert.equal(JSON.stringify(adapter.audits).includes("trk_"), false);
  await assert.rejects(
    claimCustomerTrackingCapability({
      adapter,
      customerDocumentId: "customer-verified",
      orderDocumentId: "order-verified",
      storefrontUrl,
      randomBytes: entropy(8),
      now,
    }),
    /not available/i,
  );
});

test("durable review state prevents ineligible rows starving eligible rows", async () => {
  const fixture = eligibleFixture();
  const adapter = createMemoryTrackingCapabilityAdapter({
    orders: [
      {
        documentId: "order-ineligible",
        orderNumber: "JMR-GUEST",
        email: "guest@example.test",
        customerDocumentId: null,
        trackingCapabilityHash: null,
        trackingCapabilityStatus: null,
        trackingCapabilityVersion: 0,
      },
      ...fixture.orders,
    ],
    customers: fixture.customers,
  });

  const first = await reissueLegacyTrackingCapabilities({
    adapter,
    actor: "owner@example.test",
    limit: 1,
    storefrontUrl,
    now,
  });
  const second = await reissueLegacyTrackingCapabilities({
    adapter,
    actor: "owner@example.test",
    limit: 1,
    storefrontUrl,
    now: new Date(now.getTime() + 1),
  });

  assert.equal(first.skippedIneligible, 1);
  assert.equal(first.remainingUnreviewed, 1);
  assert.equal(second.queued, 1);
  assert.equal(second.remainingUnreviewed, 0);
  assert.equal(
    adapter.orders.get("order-ineligible").trackingCapabilityStatus,
    "ineligible",
  );
  assert.equal(
    adapter.orders.get("order-verified").trackingCapabilityStatus,
    "pending_delivery",
  );
});

test("owner rotation and revocation are bounded, conditional, and audited without raw values", async () => {
  const adapter = createMemoryTrackingCapabilityAdapter(eligibleFixture({
    trackingCapabilityHash: "a".repeat(64),
    trackingCapabilityStatus: "active",
    trackingCapabilityVersion: 3,
  }));
  const rotated = await manageTrackingCapabilities({
    adapter,
    actor: "owner@example.test",
    action: "rotate",
    orderDocumentIds: ["order-verified"],
    now,
  });
  assert.deepEqual(rotated, {
    selected: 1,
    updated: 1,
    skippedConcurrent: 0,
  });
  let stored = adapter.orders.get("order-verified");
  assert.equal(stored.trackingCapabilityHash, null);
  assert.equal(stored.trackingCapabilityStatus, "pending_delivery");
  assert.equal(stored.trackingCapabilityVersion, 4);

  await claimCustomerTrackingCapability({
    adapter,
    customerDocumentId: "customer-verified",
    orderDocumentId: "order-verified",
    storefrontUrl,
    randomBytes: entropy(9),
    now,
  });
  const revoked = await manageTrackingCapabilities({
    adapter,
    actor: "owner@example.test",
    action: "revoke",
    orderDocumentIds: ["order-verified"],
    now,
  });
  assert.equal(revoked.updated, 1);
  stored = adapter.orders.get("order-verified");
  assert.equal(stored.trackingCapabilityHash, null);
  assert.equal(stored.trackingCapabilityStatus, "revoked");
  assert.equal(stored.trackingCapabilityVersion, 5);
  assert.equal(JSON.stringify(adapter.audits).includes("trk_"), false);
  await assert.rejects(
    claimCustomerTrackingCapability({
      adapter,
      customerDocumentId: "customer-verified",
      orderDocumentId: "order-verified",
      storefrontUrl,
      randomBytes: entropy(),
      now,
    }),
    /not available/i,
  );
});

test("management bounds and malformed inputs fail closed", async () => {
  assert.equal(trackingCapabilityReissueLimit(undefined), 25);
  assert.equal(trackingCapabilityReissueLimit(100), 100);
  assert.throws(() => trackingCapabilityReissueLimit(0), /limit is invalid/i);
  assert.throws(() => trackingCapabilityReissueLimit(101), /limit is invalid/i);
  const adapter = createMemoryTrackingCapabilityAdapter();
  await assert.rejects(
    manageTrackingCapabilities({
      adapter,
      actor: "owner@example.test",
      action: "rotate",
      orderDocumentIds: Array.from({ length: 101 }, (_, index) => `order-${index}`),
      now,
    }),
    /order document ids are invalid/i,
  );
  await assert.rejects(
    manageTrackingCapabilities({
      adapter,
      actor: "owner@example.test",
      action: "delete",
      orderDocumentIds: ["order-1"],
      now,
    }),
    /action is invalid/i,
  );
});
