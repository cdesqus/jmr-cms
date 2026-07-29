import assert from "node:assert/strict";
import test from "node:test";

import lifecycles from "./lifecycles.cjs";

test("payment events reject batch creation and all mutable lifecycle operations", () => {
  for (const hook of [
    "beforeCreateMany",
    "beforeUpdate",
    "beforeUpdateMany",
    "beforeDelete",
    "beforeDeleteMany",
  ]) {
    assert.throws(() => lifecycles[hook]({ params: { data: {} } }), /append-only|one at a time/);
  }
});
