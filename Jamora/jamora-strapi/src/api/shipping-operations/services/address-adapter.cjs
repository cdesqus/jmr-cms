"use strict";

const { normaliseRomanianAddress } = require("./address-domain.cjs");

const ROMANIAN_ADDRESSES = [
  ["CJ", "Cluj-Napoca", "400001", "Strada Memorandumului", "21"],
  ["B", "Bucuresti", "010011", "Strada Lipscani", "12"],
  ["IS", "Iasi", "700028", "Strada Stefan cel Mare", "8"],
  ["TM", "Timisoara", "300085", "Strada Alba Iulia", "4"],
  ["CT", "Constanta", "900178", "Strada Stefan cel Mare", "15"],
  ["CJ", "Cluj-Napoca", "400609", "Strada Republicii", "35"],
  ["B", "Bucuresti", "030167", "Strada Decebal", "10"],
  ["IS", "Iasi", "700259", "Strada Pacurari", "40"],
  ["TM", "Timisoara", "300102", "Strada Take Ionescu", "7"],
  ["CT", "Constanta", "900001", "Strada Mircea cel Batran", "3"],
].map(([subdivisionCode, locality, postalCode, street, building]) => normaliseRomanianAddress({
  countryCode: "RO", subdivisionCode, locality, postalCode, street, building,
}));

function normaliseQuery(query) {
  if (typeof query !== "string") throw new TypeError("Invalid address query.");
  const value = query.trim().replace(/\s+/g, " ");
  if (!value || value.length > 120 || /[<>\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError("Invalid address query.");
  }
  return value.toLocaleLowerCase("ro-RO");
}

function suggestionDto(address) {
  return {
    countryCode: address.countryCode,
    subdivisionCode: address.subdivisionCode,
    locality: address.locality,
    postalCode: address.postalCode,
    street: address.street,
    building: address.building,
  };
}

function suggestRomanianAddresses(query, options = {}) {
  const normalizedQuery = normaliseQuery(query);
  const requestedLimit = typeof options === "number" ? options : options.limit;
  const parsedLimit = Number.isSafeInteger(requestedLimit) ? requestedLimit : 8;
  const limit = Math.min(Math.max(parsedLimit, 1), 8);
  return ROMANIAN_ADDRESSES
    .filter((address) => [address.locality, address.postalCode, address.street]
      .some((value) => value.toLocaleLowerCase("ro-RO").includes(normalizedQuery)))
    .slice(0, limit)
    .map(suggestionDto);
}

module.exports = { suggestRomanianAddresses };
