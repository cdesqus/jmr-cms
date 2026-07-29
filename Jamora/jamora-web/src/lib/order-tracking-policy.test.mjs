import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePublicTrackingInput,
  publicTrackingSearchParams,
  trackingSurfacePolicy,
  trackingFields,
  trackingTimeline,
} from "./order-tracking-policy.cjs";

test("public tracking requests require and forward a high-entropy capability", () => {
  const access = `trk_${"A".repeat(43)}`;
  assert.equal(
    publicTrackingSearchParams("JMR-2026-1", access),
    `q=JMR-2026-1&access=${encodeURIComponent(access)}`,
  );
  assert.equal(publicTrackingSearchParams("JMR-2026-1", ""), null);
  assert.equal(publicTrackingSearchParams("JMR-2026-1", "guessable"), null);
  assert.equal(publicTrackingSearchParams("", access), null);
  assert.deepEqual(
    parsePublicTrackingInput(
      `https://shop.example.test/track?order=JMR-2026-1&access=${access}`,
    ),
    { query: "JMR-2026-1", access },
  );
  assert.deepEqual(
    parsePublicTrackingInput("JMR-2026-1", access),
    { query: "JMR-2026-1", access },
  );
  assert.equal(parsePublicTrackingInput("JMR-2026-1"), null);
});

test("public tracking surface never renders customer, item, or price details", () => {
  assert.deepEqual(trackingSurfacePolicy("tracking"), {
    showCustomer: false,
    showItems: false,
    showPrices: false,
  });
  assert.deepEqual(trackingSurfacePolicy("success"), {
    showCustomer: true,
    showItems: true,
    showPrices: true,
  });
});

test("new shipment projection replaces legacy tracking fields", () => {
  assert.deepEqual(trackingFields({
    carrier: "legacy-carrier",
    trackingNumber: "LEGACY-1",
    shipment: {
      carrier: "jamora-mock",
      service: "express",
      trackingNumber: "JMR-1",
      status: "out_for_delivery",
      updatedAt: "2026-07-25T12:00:00.000Z",
      updates: [],
      labelReference: "never",
      deliveryLabelUrl: "https://private.example/label",
    },
  }), {
    carrier: "jamora-mock",
    service: "express",
    trackingNumber: "JMR-1",
    shipmentStatus: "out_for_delivery",
  });
});

test("legacy tracking fields remain readable when shipment projection is absent", () => {
  assert.deepEqual(trackingFields({
    carrier: "Legacy Carrier",
    trackingNumber: "LEGACY-1",
  }), {
    carrier: "Legacy Carrier",
    service: undefined,
    trackingNumber: "LEGACY-1",
    shipmentStatus: undefined,
  });
});

test("only safe applied shipment updates enter the customer timeline", () => {
  assert.deepEqual(trackingTimeline({
    statusHistory: [{
      id: "order-event-1",
      type: "status",
      status: "shipped",
      note: "Shipment created.",
      actor: "Warehouse",
      createdAt: "2026-07-25T11:00:00.000Z",
    }],
    shipment: {
      status: "in_transit",
      updates: [
        {
          status: "picked_up",
          occurredAt: "2026-07-25T11:30:00.000Z",
          providerEventId: "private",
          payloadDigest: "private",
        },
        {
          status: "in_transit",
          occurredAt: "2026-07-25T12:00:00.000Z",
        },
      ],
    },
  }), [
    {
      id: "order-event-1",
      type: "status",
      status: "shipped",
      note: "Shipment created.",
      actor: "Warehouse",
      createdAt: "2026-07-25T11:00:00.000Z",
    },
    {
      id: "tracking-2026-07-25T11%3A30%3A00.000Z-picked_up",
      type: "note",
      note: "Shipment update: Picked up",
      actor: "Carrier",
      createdAt: "2026-07-25T11:30:00.000Z",
    },
    {
      id: "tracking-2026-07-25T12%3A00%3A00.000Z-in_transit",
      type: "note",
      note: "Shipment update: In transit",
      actor: "Carrier",
      createdAt: "2026-07-25T12:00:00.000Z",
    },
  ]);
});
