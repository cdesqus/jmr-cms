"use strict";

function exactMockMode(value, label) {
  const configured = value === undefined ? "mock" : value;
  if (configured !== "mock") {
    throw new Error(`${label} provider mode is unavailable.`);
  }
  return configured;
}

function assertAddressProviderMode(env = process.env) {
  return exactMockMode(env.ADDRESS_PROVIDER_MODE, "Address");
}

function assertShippingProviderMode(env = process.env) {
  return exactMockMode(env.SHIPPING_PROVIDER_MODE, "Shipping");
}

module.exports = {
  assertAddressProviderMode,
  assertShippingProviderMode,
};
