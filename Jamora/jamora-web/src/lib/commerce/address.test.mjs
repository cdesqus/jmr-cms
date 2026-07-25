import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRomanianAddressSuggestion,
  normaliseRomanianAddress,
  validateRomanianAddress,
} from "./address.cjs";

test("normalises a Romania address without losing apartment details", () => {
  assert.deepEqual(normaliseRomanianAddress({
    recipient: " Ana Popescu ", phone: " +40 712 345 678 ",
    countryCode: "ro", subdivisionCode: "B", locality: " București ",
    postalCode: "010011", street: "Calea Victoriei", building: "10", unit: "Ap. 4",
  }), {
    recipient: "Ana Popescu", phone: "+40 712 345 678", countryCode: "RO",
    subdivisionCode: "B", locality: "București", postalCode: "010011",
    street: "Calea Victoriei", building: "10", unit: "Ap. 4", instructions: "",
  });
});

test("requires Romania launch fields and a six-digit postal code", () => {
  assert.deepEqual(validateRomanianAddress(normaliseRomanianAddress({
    recipient: "Ana", countryCode: "RO", locality: "Cluj", postalCode: "400001",
    street: "Strada Memorandumului", building: "1",
  })), []);
  assert.deepEqual(validateRomanianAddress(normaliseRomanianAddress({
    recipient: "", countryCode: "DE", locality: "", postalCode: "ABC", street: "", building: "",
  })), ["recipient", "countryCode", "locality", "postalCode", "street", "building"]);
});

test("suggestions fill location fields without overriding manual contact details", () => {
  const current = normaliseRomanianAddress({
    recipient: "Ana Popescu",
    phone: "+40 721 000 000",
    unit: "4",
    instructions: "Interfon 7",
    street: "Manual street",
  });
  assert.deepEqual(applyRomanianAddressSuggestion(current, {
    countryCode: "RO",
    subdivisionCode: "B",
    locality: "Bucuresti",
    postalCode: "010101",
    street: "Calea Victoriei",
    building: "10",
    providerId: "never-copy",
  }), {
    recipient: "Ana Popescu",
    phone: "+40 721 000 000",
    countryCode: "RO",
    subdivisionCode: "B",
    locality: "Bucuresti",
    postalCode: "010101",
    street: "Calea Victoriei",
    building: "10",
    unit: "4",
    instructions: "Interfon 7",
  });
});
