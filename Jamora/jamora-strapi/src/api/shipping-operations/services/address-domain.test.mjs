import assert from "node:assert/strict";
import test from "node:test";

import {
  assessRomanianAddress,
  normaliseRomanianAddress,
} from "./address-domain.cjs";

test("normaliseRomanianAddress keeps an explicit manual address while trimming its DTO fields", () => {
  assert.deepEqual(normaliseRomanianAddress({
    recipient: "  Ana Popescu ",
    countryCode: " ro ",
    subdivisionCode: "  CJ ",
    locality: " Cluj-Napoca ",
    postalCode: " 400001 ",
    street: " Strada Memorandumului ",
    building: " 21 ",
    unit: " 4 ",
    instructions: " Sunati la interfon ",
    providerConfidence: 0.99,
  }), {
    recipient: "Ana Popescu",
    phone: "",
    countryCode: "RO",
    subdivisionCode: "CJ",
    locality: "Cluj-Napoca",
    postalCode: "400001",
    street: "Strada Memorandumului",
    building: "21",
    unit: "4",
    instructions: "Sunati la interfon",
  });
});

test("assessRomanianAddress separates required errors from advisory county and locality warnings", () => {
  const assessed = assessRomanianAddress({
    recipient: "Ana Popescu",
    countryCode: "RO",
    subdivisionCode: "CJ",
    locality: "Bucuresti",
    postalCode: "400001",
    street: "Strada Memorandumului",
    building: "21",
  });

  assert.deepEqual(assessed.errors, []);
  assert.deepEqual(assessed.warnings, ["locality does not match subdivisionCode"]);
  assert.equal(assessed.address.locality, "Bucuresti");
});

test("assessRomanianAddress requires a six-digit Romanian postal code without elevating confidence into validation", () => {
  const assessed = assessRomanianAddress({
    recipient: "Ana Popescu",
    countryCode: "RO",
    locality: "Cluj-Napoca",
    postalCode: "40001",
    street: "Strada Memorandumului",
    building: "21",
    providerConfidence: 1,
  });

  assert.deepEqual(assessed.errors, ["postalCode"]);
  assert.equal(assessed.warnings.length, 0);
});

test("assessment canonicalizes county aliases and warns from the same postal authority", () => {
  const matching = assessRomanianAddress({
    recipient: "Ana",
    countryCode: "RO",
    subdivisionCode: "Judetul Satu Mare",
    locality: "Satu Mare",
    postalCode: "440001",
    street: "Strada Horea",
    building: "2",
  });
  assert.equal(matching.address.subdivisionCode, "SM");
  assert.deepEqual(matching.errors, []);
  assert.deepEqual(matching.warnings, []);

  const mismatch = assessRomanianAddress({
    ...matching.address,
    subdivisionCode: "RO-CJ",
  });
  assert.deepEqual(mismatch.warnings, [
    "postalCode does not match subdivisionCode",
    "locality does not match subdivisionCode",
  ]);

  const sectorMismatch = assessRomanianAddress({
    ...matching.address,
    subdivisionCode: "Bucuresti Sector 1",
    locality: "Bucuresti",
    postalCode: "020001",
  });
  assert.deepEqual(sectorMismatch.warnings, [
    "postalCode does not match subdivisionCode",
  ]);

  const unmapped = assessRomanianAddress({
    ...matching.address,
    subdivisionCode: "SM",
    postalCode: "990001",
  });
  assert.deepEqual(unmapped.warnings, ["postalCode is not recognized"]);

  const unverifiedDiscountLocality = assessRomanianAddress({
    ...matching.address,
    subdivisionCode: "CJ",
    locality: "Turda",
    postalCode: "400001",
  });
  assert.deepEqual(unverifiedDiscountLocality.warnings, [
    "locality could not be verified for discounted shipping zone",
  ]);

  const ambiguousSubdivision = assessRomanianAddress({
    ...matching.address,
    subdivisionCode: "RO-CJ Bucuresti Sector 1",
    locality: "Bucuresti",
    postalCode: "010001",
  });
  assert.deepEqual(ambiguousSubdivision.warnings, [
    "subdivisionCode is not recognized",
  ]);
});
