"use strict";

const FIELDS = [
  "recipient",
  "phone",
  "subdivisionCode",
  "locality",
  "postalCode",
  "street",
  "building",
  "unit",
  "instructions",
];

const {
  isRomanianDiscountEligibleCounty,
  normalizeRomanianCountyCode,
  resolveRomanianLocalityCounty,
  resolveRomanianPostalAuthority,
  resolveRomanianSubdivision,
} = require("./romanian-postal-authority.cjs");

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normaliseRomanianAddress(input = {}) {
  const address = { countryCode: text(input.countryCode || "RO").toUpperCase() };
  for (const field of FIELDS) address[field] = text(input[field]);
  const countyCode = normalizeRomanianCountyCode(address.subdivisionCode);
  return {
    recipient: address.recipient,
    phone: address.phone,
    countryCode: address.countryCode,
    subdivisionCode: countyCode || address.subdivisionCode.toUpperCase(),
    locality: address.locality,
    postalCode: address.postalCode,
    street: address.street,
    building: address.building,
    unit: address.unit,
    instructions: address.instructions,
  };
}

function assessRomanianAddress(input = {}) {
  const address = normaliseRomanianAddress(input);
  const subdivision = resolveRomanianSubdivision(input.subdivisionCode);
  const postalAuthority = resolveRomanianPostalAuthority(address.postalCode);
  const localityCounty = resolveRomanianLocalityCounty(address.locality);
  const errors = [];
  const warnings = [];

  if (!address.recipient) errors.push("recipient");
  if (address.countryCode !== "RO") errors.push("countryCode");
  if (!address.locality) errors.push("locality");
  if (!/^\d{6}$/.test(address.postalCode)) errors.push("postalCode");
  if (!address.street) errors.push("street");
  if (!address.building) errors.push("building");

  if (/^\d{6}$/.test(address.postalCode) && !postalAuthority) {
    warnings.push("postalCode is not recognized");
  }
  if (address.subdivisionCode && !subdivision) {
    warnings.push("subdivisionCode is not recognized");
  }
  if (postalAuthority && subdivision &&
      (postalAuthority.countyCode !== subdivision.countyCode ||
       (subdivision.sector &&
        postalAuthority.sector !== subdivision.sector))) {
    warnings.push("postalCode does not match subdivisionCode");
  }
  if (postalAuthority && subdivision &&
      postalAuthority.countyCode === subdivision.countyCode &&
      (!subdivision.sector || postalAuthority.sector === subdivision.sector) &&
      isRomanianDiscountEligibleCounty(postalAuthority.countyCode) &&
      address.locality &&
      !localityCounty) {
    warnings.push("locality could not be verified for discounted shipping zone");
  }
  if (localityCounty && subdivision &&
      localityCounty !== subdivision.countyCode) {
    warnings.push("locality does not match subdivisionCode");
  } else if (localityCounty && postalAuthority && !subdivision &&
      localityCounty !== postalAuthority.countyCode) {
    warnings.push("locality does not match postalCode");
  }

  return { address, errors, warnings };
}

module.exports = { normaliseRomanianAddress, assessRomanianAddress };
