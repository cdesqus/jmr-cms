import assert from "node:assert/strict";
import test from "node:test";

import { hasStorefrontSecret } from "./storefront-secret.cjs";

test("missing configured storefront secret fails closed", () => {
  assert.equal(hasStorefrontSecret("anything", undefined), false);
});

test("wrong storefront secret is rejected", () => {
  assert.equal(hasStorefrontSecret("wrong", "configured"), false);
});

test("exact storefront secret is accepted", () => {
  assert.equal(hasStorefrontSecret("configured", "configured"), true);
});
