import assert from "node:assert/strict";
import test from "node:test";

import { suggestRomanianAddresses } from "./address-adapter.cjs";

test("suggestRomanianAddresses returns normalized deterministic Romanian suggestions", () => {
  const suggestions = suggestRomanianAddresses(" memorandumului ");

  assert.ok(suggestions.length > 0);
  assert.deepEqual(suggestions[0], {
    countryCode: "RO",
    subdivisionCode: "CJ",
    locality: "Cluj-Napoca",
    postalCode: "400001",
    street: "Strada Memorandumului",
    building: "21",
  });
});

test("suggestRomanianAddresses caps results at eight", () => {
  assert.equal(suggestRomanianAddresses("strada", { limit: 99 }).length, 8);
  assert.equal(suggestRomanianAddresses("strada", 2).length, 2);
});

test("suggestRomanianAddresses rejects malicious or oversized queries", () => {
  assert.throws(() => suggestRomanianAddresses("<script>alert(1)</script>"), /Invalid address query/);
  assert.throws(() => suggestRomanianAddresses("a".repeat(121)), /Invalid address query/);
});
