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
