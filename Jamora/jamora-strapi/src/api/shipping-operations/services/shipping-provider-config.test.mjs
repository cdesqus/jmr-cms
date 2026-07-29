import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAddressProviderMode,
  assertShippingProviderMode,
} from "./shipping-provider-config.cjs";

test("Phase 3 provider modes default to mock and fail closed on unimplemented modes", () => {
  assert.equal(assertAddressProviderMode({}), "mock");
  assert.equal(assertAddressProviderMode({ ADDRESS_PROVIDER_MODE: "mock" }), "mock");
  assert.equal(assertShippingProviderMode({}), "mock");
  assert.equal(assertShippingProviderMode({ SHIPPING_PROVIDER_MODE: "mock" }), "mock");
  for (const value of ["live", "MOCK", " mock ", ""]) {
    if (!value) continue;
    assert.throws(
      () => assertAddressProviderMode({ ADDRESS_PROVIDER_MODE: value }),
      /address provider mode is unavailable/i,
    );
    assert.throws(
      () => assertShippingProviderMode({ SHIPPING_PROVIDER_MODE: value }),
      /shipping provider mode is unavailable/i,
    );
  }
});
