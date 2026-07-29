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

test("Phase 3 deployment gate runs the full web suite and documents capability-only tracking", () => {
  const deployment = readFileSync(new URL(
    "../../../../DEPLOYMENT.md",
    import.meta.url,
  ), "utf8");
  const phase3 = deployment.slice(
    deployment.indexOf("## Phase 3 Address and Shipping Deployment"),
  );
  assert.match(phase3, /cd jamora-web\r?\nnpm test\r?\nnpm run lint/);
  assert.doesNotMatch(
    deployment,
    /\/track` finds the guest order by order\/tracking number/i,
  );
  assert.doesNotMatch(
    phase3,
    /node --test --test-force-exit src\/lib\/\*\*\/\*\.test\.mjs/,
  );
  assert.match(
    phase3,
    /public tracking accepts only a valid `trk_` capability/i,
  );
});
