import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLabelCapability,
  canManageShipping,
  isShippingEnabled,
  safeShipmentMutationResponse,
  shippingAdminOperation,
  shippingProviderError,
  shippingRequestFailure,
} from "./shipping-admin-policy.cjs";
import { canAccessAdminPath } from "./admin-auth.ts";

test("shipping administration is exact-gated to owners and warehouse staff", () => {
  assert.equal(isShippingEnabled({ SHIPPING_ENABLED: "true" }), true);
  for (const value of [undefined, "TRUE", "1", " true"]) {
    assert.equal(isShippingEnabled({ SHIPPING_ENABLED: value }), false);
  }
  assert.equal(canManageShipping({ role: "owner" }), true);
  assert.equal(canManageShipping({ role: "warehouse" }), true);
  for (const identity of [null, { role: "support" }, { role: "content" }]) {
    assert.equal(canManageShipping(identity), false);
  }
  assert.equal(canAccessAdminPath("owner", "/admin/api/shipping/shipments/order-1"), true);
  assert.equal(canAccessAdminPath("warehouse", "/admin/api/shipping/shipments/order-1"), true);
  assert.equal(canAccessAdminPath("warehouse", "/admin/api/shippingevil/shipments/order-1"), false);
  assert.equal(canAccessAdminPath("support", "/admin/api/shipping/shipments/order-1"), false);
  assert.equal(canAccessAdminPath("content", "/admin/api/shipping/shipments/order-1"), false);
});

test("BFF permits only explicit shipment creation, capability, and label download operations", () => {
  assert.deepEqual(
    shippingAdminOperation("POST", ["shipments", "order-1"]),
    {
      kind: "create",
      targetPath: "/api/jamora/admin/shipping/shipments/order-1",
    },
  );
  assert.deepEqual(
    shippingAdminOperation(
      "POST",
      ["shipments", "shipment-1", "labels", "capability"],
      { format: "pdf" },
    ),
    {
      kind: "capability",
      targetPath: "/api/jamora/admin/shipping/shipments/shipment-1/labels/capability",
      body: JSON.stringify({ format: "pdf" }),
    },
  );
  assert.deepEqual(
    shippingAdminOperation("GET", ["shipments", "shipment-1", "labels"]),
    {
      kind: "download",
      targetPath: "/api/jamora/admin/shipping/shipments/shipment-1/labels",
    },
  );

  for (const [method, path] of [
    ["GET", ["shipments", "order-1"]],
    ["DELETE", ["shipments", "shipment-1"]],
    ["POST", ["shipments"]],
    ["POST", ["shipments", ".."]],
    ["POST", ["shipments", "shipment/foreign", "labels", "capability"]],
    ["GET", ["shipments", "shipment-1", "labels", "provider-url"]],
  ]) {
    assert.throws(() => shippingAdminOperation(method, path), /not allowed/i);
  }
});

test("label inputs permit only PDF/ZPL and bounded opaque capabilities", () => {
  assert.equal(
    shippingAdminOperation(
      "POST",
      ["shipments", "shipment-1", "labels", "capability"],
      { format: " PDF ", actor: "forged@example.test", providerUrl: "forged" },
    ).body,
    JSON.stringify({ format: "pdf" }),
  );
  assert.equal(
    shippingAdminOperation(
      "POST",
      ["shipments", "shipment-1", "labels", "capability"],
      { format: "zpl" },
    ).body,
    JSON.stringify({ format: "zpl" }),
  );
  assert.throws(
    () => shippingAdminOperation(
      "POST",
      ["shipments", "shipment-1", "labels", "capability"],
      { format: "html" },
    ),
    /PDF or ZPL/i,
  );
  assert.equal(assertLabelCapability(" opaque.signed "), "opaque.signed");
  assert.throws(() => assertLabelCapability(" "), /required/i);
  assert.throws(() => assertLabelCapability("x".repeat(4097)), /invalid/i);
});

test("BFF preserves bounded JSON 413/400 semantics and treats invalid input as 400", () => {
  assert.deepEqual(
    shippingRequestFailure({ status: 413, message: "Request is too large." }),
    { status: 413, message: "Request is too large." },
  );
  assert.deepEqual(
    shippingRequestFailure({ status: 400, message: "Invalid request." }),
    { status: 400, message: "Invalid request." },
  );
  assert.deepEqual(
    shippingRequestFailure(new TypeError("Label format must be PDF or ZPL.")),
    { status: 400, message: "Label format must be PDF or ZPL." },
  );
  assert.deepEqual(
    shippingRequestFailure(new Error("Shipping admin operation is not allowed.")),
    { status: 404, message: "Not found." },
  );
});

test("BFF JSON responses retain no provider references, URLs, secrets, or capability state", () => {
  assert.deepEqual(safeShipmentMutationResponse({
    idempotent: false,
    shipment: {
      documentId: "shipment-1",
      orderDocumentId: "order-1",
      orderNumber: "JMR-1001",
      carrier: "jamora-mock",
      service: "standard",
      awb: "JMR202607251200001234",
      status: "label_created",
      labelFormats: ["pdf", "zpl", "html"],
      labelReference: "private-reference",
      labelCapabilityHash: "private-hash",
      providerUrl: "https://provider.example/private",
      providerSecret: "never",
    },
  }, "create"), {
    idempotent: false,
    shipment: {
      documentId: "shipment-1",
      orderDocumentId: "order-1",
      orderNumber: "JMR-1001",
      carrier: "jamora-mock",
      service: "standard",
      awb: "JMR202607251200001234",
      status: "label_created",
      labelFormats: ["pdf", "zpl"],
    },
  });

  assert.deepEqual(safeShipmentMutationResponse({
    capability: "opaque.signed",
    expiresAt: "2026-07-25T12:01:00.000Z",
    format: "pdf",
    providerUrl: "https://provider.example/private",
    secret: "never",
  }, "capability"), {
    capability: "opaque.signed",
    expiresAt: "2026-07-25T12:01:00.000Z",
    format: "pdf",
  });
  assert.equal(
    shippingProviderError({ error: "Provider API secret missing" }),
    "Shipping service unavailable.",
  );
});
