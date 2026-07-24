import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer plan listing validates a customer session instead of feature gate alone", async () => {
  const source = await readFile(new URL("./membership-operations.ts", import.meta.url), "utf8");
  assert.match(source, /async plans\(ctx: any\) \{ const identity = await customer\(ctx\)/);
  assert.doesNotMatch(source, /async plans\(ctx: any\) \{ if \(enabled\(ctx\)\)/);
});
