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

const LOCALITY_SUBDIVISIONS = new Map([
  ["bucuresti", "B"],
  ["cluj", "CJ"],
  ["cluj-napoca", "CJ"],
  ["baia mare", "MM"],
  ["brasov", "BV"],
  ["iasi", "IS"],
  ["timisoara", "TM"],
  ["constanta", "CT"],
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalLocality(value) {
  return text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("ro-RO");
}

function normaliseRomanianAddress(input = {}) {
  const address = { countryCode: text(input.countryCode || "RO").toUpperCase() };
  for (const field of FIELDS) address[field] = text(input[field]);
  return {
    recipient: address.recipient,
    phone: address.phone,
    countryCode: address.countryCode,
    subdivisionCode: address.subdivisionCode.toUpperCase(),
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
  const errors = [];
  const warnings = [];

  if (!address.recipient) errors.push("recipient");
  if (address.countryCode !== "RO") errors.push("countryCode");
  if (!address.locality) errors.push("locality");
  if (!/^\d{6}$/.test(address.postalCode)) errors.push("postalCode");
  if (!address.street) errors.push("street");
  if (!address.building) errors.push("building");

  if (address.locality && address.subdivisionCode) {
    const expected = LOCALITY_SUBDIVISIONS.get(canonicalLocality(address.locality));
    if (expected && expected !== address.subdivisionCode) {
      warnings.push("locality does not match subdivisionCode");
    }
  }

  return { address, errors, warnings };
}

module.exports = { normaliseRomanianAddress, assessRomanianAddress };
