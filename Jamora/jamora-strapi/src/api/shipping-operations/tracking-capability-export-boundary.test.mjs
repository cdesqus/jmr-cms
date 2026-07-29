import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner order exports never reveal private public-tracking capabilities", () => {
  const source = readFileSync(new URL(
    "../analytics/controllers/analytics.ts",
    import.meta.url,
  ), "utf8");
  const start = source.indexOf("async adminOrders(ctx)");
  const end = source.indexOf("async adminCustomers(ctx)", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.equal(
    source.slice(start, end).includes('"trackingPreviewUrl"'),
    false,
  );
});

test("checkout persistence never includes the raw tracking preview capability", () => {
  const source = readFileSync(new URL(
    "../analytics/controllers/analytics.ts",
    import.meta.url,
  ), "utf8");
  const start = source.indexOf("const orderData = {");
  const end = source.indexOf("let order;", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.equal(
    source.slice(start, end).includes("trackingPreviewUrl"),
    false,
  );
  assert.equal(
    source.slice(start, end).includes("trackingCapabilityHash"),
    true,
  );
});
