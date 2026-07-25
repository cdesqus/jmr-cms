"use strict";

const REGIONAL_SUBDIVISIONS = new Set([
  "BV", "CJ", "CT", "DJ", "IS", "SB", "TM",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAuthoritativeWeightGrams(product) {
  if (Number.isSafeInteger(product?.shippingWeightGrams) &&
      product.shippingWeightGrams > 0) {
    return product.shippingWeightGrams;
  }
  const netWeight = text(product?.netWeight).replace(",", ".");
  const matches = [...netWeight.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g)\b/gi)];
  if (!matches.length) {
    throw new TypeError("Authoritative product weight is unavailable.");
  }
  const [, numberText, unit] = matches.at(-1);
  const grams = Number(numberText) * (unit.toLowerCase() === "kg" ? 1_000 : 1);
  const rounded = Math.round(grams);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) {
    throw new TypeError("Authoritative product weight is invalid.");
  }
  return rounded;
}

function canonicalSubdivision(value) {
  return text(value).toUpperCase().replace(/^RO-/, "");
}

function canonicalLocality(value) {
  return text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("ro-RO");
}

function deriveRomanianShippingZone(address) {
  const subdivision = canonicalSubdivision(address?.subdivisionCode);
  const postalCode = text(address?.postalCode);
  const metroSubdivision = subdivision === "B" || subdivision === "IF";
  const metroPostalCode = /^0[1-7]\d{4}$/.test(postalCode);
  if (metroSubdivision !== metroPostalCode) return "national";
  if (subdivision === "B" &&
      canonicalLocality(address?.locality) !== "bucuresti") {
    return "national";
  }
  if (metroSubdivision) return "metro";
  if (REGIONAL_SUBDIVISIONS.has(subdivision)) return "regional";
  return "national";
}

function checkedAdd(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return result;
}

function quoteMockShippingServices({ totalWeightGrams, zone }) {
  if (!Number.isSafeInteger(totalWeightGrams) || totalWeightGrams <= 0) {
    throw new TypeError("Total shipping weight must be a positive safe integer.");
  }
  if (!["metro", "regional", "national"].includes(zone)) {
    throw new TypeError("Shipping zone is invalid.");
  }
  const extraKilograms = Math.max(0, Math.ceil((totalWeightGrams - 1_000) / 1_000));
  const standardZone = { metro: 0, regional: 400, national: 750 }[zone];
  const expressZone = { metro: 500, regional: 900, national: 1_400 }[zone];
  const standardWeight = extraKilograms * 350;
  const expressWeight = extraKilograms * 550;
  if (!Number.isSafeInteger(standardWeight) || !Number.isSafeInteger(expressWeight)) {
    throw new RangeError("Shipping price exceeds safe integer range.");
  }
  const estimates = {
    standard: {
      metro: { minimumDays: 1, maximumDays: 2 },
      regional: { minimumDays: 2, maximumDays: 3 },
      national: { minimumDays: 3, maximumDays: 5 },
    },
    express: {
      metro: { minimumDays: 1, maximumDays: 1 },
      regional: { minimumDays: 1, maximumDays: 2 },
      national: { minimumDays: 2, maximumDays: 3 },
    },
  };
  return [
    {
      carrier: "jamora-mock",
      service: "standard",
      amountMinor: checkedAdd(
        checkedAdd(1_690, standardZone, "Standard shipping price"),
        standardWeight,
        "Standard shipping price",
      ),
      currency: "RON",
      estimate: estimates.standard[zone],
    },
    {
      carrier: "jamora-mock",
      service: "express",
      amountMinor: checkedAdd(
        checkedAdd(2_990, expressZone, "Express shipping price"),
        expressWeight,
        "Express shipping price",
      ),
      currency: "RON",
      estimate: estimates.express[zone],
    },
  ];
}

module.exports = {
  deriveRomanianShippingZone,
  parseAuthoritativeWeightGrams,
  quoteMockShippingServices,
};
