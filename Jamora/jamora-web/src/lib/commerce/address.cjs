const FIELDS = ["recipient", "phone", "subdivisionCode", "locality", "postalCode", "street", "building", "unit", "instructions"];

function normaliseRomanianAddress(input = {}) {
  const result = { countryCode: String(input.countryCode || "RO").trim().toUpperCase() };
  for (const field of FIELDS) result[field] = String(input[field] || "").trim();
  return {
    recipient: result.recipient, phone: result.phone, countryCode: result.countryCode,
    subdivisionCode: result.subdivisionCode, locality: result.locality,
    postalCode: result.postalCode, street: result.street, building: result.building,
    unit: result.unit, instructions: result.instructions,
  };
}

function validateRomanianAddress(address) {
  const errors = [];
  if (!address.recipient) errors.push("recipient");
  if (address.countryCode !== "RO") errors.push("countryCode");
  if (!address.locality) errors.push("locality");
  if (!/^\d{6}$/.test(address.postalCode)) errors.push("postalCode");
  if (!address.street) errors.push("street");
  if (!address.building) errors.push("building");
  return errors;
}

function applyRomanianAddressSuggestion(address, suggestion = {}) {
  const current = normaliseRomanianAddress(address);
  return normaliseRomanianAddress({
    ...current,
    countryCode: suggestion.countryCode,
    subdivisionCode: suggestion.subdivisionCode,
    locality: suggestion.locality,
    postalCode: suggestion.postalCode,
    street: suggestion.street,
    building: suggestion.building,
  });
}

module.exports = {
  applyRomanianAddressSuggestion,
  normaliseRomanianAddress,
  validateRomanianAddress,
};
