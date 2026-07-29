import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryTrackingCapabilityAdapter,
  listCustomerTrackingLinks,
  reissueLegacyTrackingCapabilities,
  trackingCapabilityReissueLimit,
} from "./tracking-capability-reissue.cjs";

const now = new Date("2026-07-29T08:00:00.000Z");
const storefrontUrl = "https://shop.example.test";

function entropy() {
  let value = 0;
  return () => Buffer.alloc(32, ++value);
}

test("legacy reissue is bounded, account-verified, atomic, and never returns or audits raw capabilities", async () => {
  const adapter = createMemoryTrackingCapabilityAdapter({
    orders: [
      {
        documentId: "order-verified",
        orderNumber: "JMR-VERIFIED",
        email: "ana@example.test",
        customerDocumentId: "customer-verified",
        trackingCapabilityHash: null,
        trackingPreviewUrl: null,
      },
      {
        documentId: "order-unverified",
        orderNumber: "JMR-UNVERIFIED",
        email: "guest@example.test",
        customerDocumentId: null,
        trackingCapabilityHash: null,
        trackingPreviewUrl: null,
      },
      {
        documentId: "order-existing",
        orderNumber: "JMR-EXISTING",
        email: "existing@example.test",
        customerDocumentId: "customer-existing",
        trackingCapabilityHash: "a".repeat(64),
        trackingPreviewUrl: "https://shop.example.test/track?order=JMR-EXISTING&access=trk_existing",
      },
    ],
    customers: [
      {
        documentId: "customer-verified",
        email: "ana@example.test",
        active: true,
        emailVerifiedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  });

  const result = await reissueLegacyTrackingCapabilities({
    adapter,
    actor: "owner@example.test",
    limit: 2,
    storefrontUrl,
    randomBytes: entropy(),
    now,
  });

  assert.deepEqual(result, {
    selected: 2,
    reissued: 1,
    skippedIneligible: 1,
    skippedConcurrent: 0,
    remainingMissing: 1,
  });
  const updated = adapter.orders.get("order-verified");
  assert.match(updated.trackingCapabilityHash, /^[a-f0-9]{64}$/);
  assert.match(
    updated.trackingPreviewUrl,
    /^https:\/\/shop\.example\.test\/track\?order=JMR-VERIFIED&access=trk_[A-Za-z0-9_-]{43}$/,
  );
  assert.equal(adapter.orders.get("order-unverified").trackingCapabilityHash, null);
  assert.equal(adapter.orders.get("order-existing").trackingCapabilityHash, "a".repeat(64));

  const serializedSummary = JSON.stringify(result);
  const serializedAudit = JSON.stringify(adapter.audits);
  assert.equal(serializedSummary.includes("trk_"), false);
  assert.equal(serializedAudit.includes("trk_"), false);
  assert.deepEqual(adapter.audits.map((entry) => ({
    action: entry.action,
    actor: entry.actor,
    entityId: entry.entityId,
    outcome: entry.details.outcome,
  })), [
    {
      action: "shipping.tracking-capability.reissued",
      actor: "owner@example.test",
      entityId: "order-verified",
      outcome: "reissued",
    },
    {
      action: "shipping.tracking-capability.skipped",
      actor: "owner@example.test",
      entityId: "order-unverified",
      outcome: "ineligible",
    },
    {
      action: "shipping.tracking-capability.batch",
      actor: "owner@example.test",
      entityId: undefined,
      outcome: "completed",
    },
  ]);
});

test("a row that gains a capability concurrently is skipped without overwriting or exposing it", async () => {
  const adapter = createMemoryTrackingCapabilityAdapter({
    orders: [{
      documentId: "order-race",
      orderNumber: "JMR-RACE",
      email: "race@example.test",
      customerDocumentId: "customer-race",
      trackingCapabilityHash: null,
      trackingPreviewUrl: null,
    }],
    customers: [{
      documentId: "customer-race",
      email: "race@example.test",
      active: true,
      emailVerifiedAt: "2026-07-01T00:00:00.000Z",
    }],
    beforeConditionalUpdate(order) {
      order.trackingCapabilityHash = "b".repeat(64);
      order.trackingPreviewUrl = "https://shop.example.test/track?order=JMR-RACE&access=trk_concurrent";
    },
  });

  const result = await reissueLegacyTrackingCapabilities({
    adapter,
    actor: "owner@example.test",
    limit: 1,
    storefrontUrl,
    randomBytes: entropy(),
    now,
  });

  assert.equal(result.reissued, 0);
  assert.equal(result.skippedConcurrent, 1);
  assert.equal(adapter.orders.get("order-race").trackingCapabilityHash, "b".repeat(64));
  assert.equal(JSON.stringify(adapter.audits).includes("trk_concurrent"), false);
});

test("reissue bounds are safe and reject malformed actor or storefront origin", async () => {
  assert.equal(trackingCapabilityReissueLimit(undefined), 25);
  assert.equal(trackingCapabilityReissueLimit(100), 100);
  assert.throws(() => trackingCapabilityReissueLimit(0), /limit is invalid/i);
  assert.throws(() => trackingCapabilityReissueLimit(101), /limit is invalid/i);

  const adapter = createMemoryTrackingCapabilityAdapter();
  await assert.rejects(
    reissueLegacyTrackingCapabilities({
      adapter,
      actor: "",
      storefrontUrl,
      now,
    }),
    /actor is required/i,
  );
  await assert.rejects(
    reissueLegacyTrackingCapabilities({
      adapter,
      actor: "owner@example.test",
      storefrontUrl: "http://shop.example.test",
      now,
    }),
    /https storefront url is required/i,
  );
});

test("customer links expose only valid same-origin capabilities bound to the verified account", async () => {
  const access = `trk_${Buffer.alloc(32, 7).toString("base64url")}`;
  const adapter = createMemoryTrackingCapabilityAdapter({
    orders: [
      {
        documentId: "order-valid",
        orderNumber: "JMR-VALID",
        customerDocumentId: "customer-1",
        trackingCapabilityHash:
          "5dd38b968b0cef130c93d09fbeacfdb9b4f0fb867bc8786906cffbb0e066c7c5",
        trackingPreviewUrl:
          `${storefrontUrl}/track?order=JMR-VALID&access=${access}`,
      },
      {
        documentId: "order-forged",
        orderNumber: "JMR-FORGED",
        customerDocumentId: "customer-1",
        trackingCapabilityHash: "0".repeat(64),
        trackingPreviewUrl:
          `${storefrontUrl}/track?order=JMR-FORGED&access=${access}`,
      },
      {
        documentId: "order-other",
        orderNumber: "JMR-OTHER",
        customerDocumentId: "customer-2",
        trackingCapabilityHash:
          "5dd38b968b0cef130c93d09fbeacfdb9b4f0fb867bc8786906cffbb0e066c7c5",
        trackingPreviewUrl:
          `${storefrontUrl}/track?order=JMR-OTHER&access=${access}`,
      },
    ],
  });

  assert.deepEqual(await listCustomerTrackingLinks({
    adapter,
    customerDocumentId: "customer-1",
    storefrontUrl,
  }), [{
    orderNumber: "JMR-VALID",
    trackingUrl: `${storefrontUrl}/track?order=JMR-VALID&access=${access}`,
  }]);
});
