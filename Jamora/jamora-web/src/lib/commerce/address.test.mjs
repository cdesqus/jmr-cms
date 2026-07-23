import test from "node:test";
import assert from "node:assert/strict";
import { normaliseRomanianAddress, validateRomanianAddress } from "./address.cjs";

test("normalises a Romania address without losing apartment details", () => {
  assert.deepEqual(normaliseRomanianAddress({
    recipient: " Ana Popescu ", phone: " +40 712 345 678 ",
    countryCode: "ro", subdivisionCode: "B", locality: " BucureÈ™ti ",
    postalCode: "010011", street: "Calea Victoriei", building: "10", unit: "Ap. 4",
  }), {
    recipient: "Ana Popescu", phone: "+40 712 345 678", countryCode: "RO",
    subdivisionCode: "B", locality: "BucureÈ™ti", postalCode: "010011",
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
