import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrivateShipmentLabel,
  packingProgressPayload,
} from "./shipment-label-client.cjs";

test("packing action does not contact shipping before the checklist is complete", async () => {
  let calls = 0;
  await assert.rejects(
    createPrivateShipmentLabel({
      orderDocumentId: "order-1",
      packingComplete: false,
      async fetcher() {
        calls += 1;
        throw new Error("must not be called");
      },
    }),
    /complete packing/i,
  );
  assert.equal(calls, 0);
});

test("packing retries never carry an order status that could regress a shipped order", () => {
  const fulfilmentChecklist = [
    { name: "Jamu One", qty: 1, scannedQty: 1, checked: true },
  ];
  const payload = packingProgressPayload({
    packedBy: "Warehouse One",
    fulfilmentChecklist,
    status: "processing",
  });
  assert.deepEqual(payload, {
    packedBy: "Warehouse One",
    fulfilmentChecklist,
  });
  assert.equal("status" in payload, false);
});

test("packing action creates one shipment, obtains one PDF capability, and downloads privately", async () => {
  const calls = [];
  const responses = [
    Response.json({
      idempotent: false,
      shipment: {
        documentId: "shipment-1",
        orderDocumentId: "order-1",
        awb: "JMR202607251200001234",
        labelFormats: ["pdf", "zpl"],
      },
    }),
    Response.json({
      capability: "opaque.signed",
      expiresAt: "2026-07-25T12:01:00.000Z",
      format: "pdf",
    }),
    new Response("%PDF-1.4\n%%EOF", {
      headers: { "content-type": "application/pdf" },
    }),
  ];

  const result = await createPrivateShipmentLabel({
    orderDocumentId: "order-1",
    packingComplete: true,
    async fetcher(url, init) {
      calls.push({ url, init });
      return responses.shift();
    },
  });

  assert.equal(result.filename, "JMR202607251200001234-label.pdf");
  assert.equal(result.blob.type, "application/pdf");
  assert.deepEqual(calls, [
    {
      url: "/admin/api/shipping/shipments/order-1",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    },
    {
      url: "/admin/api/shipping/shipments/shipment-1/labels/capability",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "pdf" }),
      },
    },
    {
      url: "/admin/api/shipping/shipments/shipment-1/labels?capability=opaque.signed",
      init: { method: "GET", cache: "no-store" },
    },
  ]);
});

test("packing action rejects forged identifiers, leaked backend errors, and non-PDF labels", async () => {
  await assert.rejects(
    createPrivateShipmentLabel({
      orderDocumentId: "../foreign",
      packingComplete: true,
      async fetcher() {
        throw new Error("must not be called");
      },
    }),
    /invalid order/i,
  );

  await assert.rejects(
    createPrivateShipmentLabel({
      orderDocumentId: "order-1",
      packingComplete: true,
      async fetcher() {
        return Response.json(
          { error: "Provider API secret sk_live_never_expose" },
          { status: 502 },
        );
      },
    }),
    (error) => {
      assert.equal(error.message, "Could not create shipment label.");
      assert.equal(error.message.includes("sk_live"), false);
      return true;
    },
  );

  const responses = [
    Response.json({
      shipment: {
        documentId: "shipment-1",
        awb: "JMR202607251200001234",
        labelFormats: ["pdf"],
      },
    }),
    Response.json({
      capability: "opaque.signed",
      expiresAt: "2026-07-25T12:01:00.000Z",
      format: "pdf",
    }),
    new Response("<script>bad</script>", {
      headers: { "content-type": "text/html" },
    }),
  ];
  await assert.rejects(
    createPrivateShipmentLabel({
      orderDocumentId: "order-1",
      packingComplete: true,
      async fetcher() {
        return responses.shift();
      },
    }),
    /invalid private label/i,
  );
});
