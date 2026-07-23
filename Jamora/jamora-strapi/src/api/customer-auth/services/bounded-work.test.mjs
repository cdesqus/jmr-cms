import assert from "node:assert/strict";
import test from "node:test";

import { createBoundedWork } from "./bounded-work.cjs";

test("bounds concurrent password-hash work", async () => {
  const bounded = createBoundedWork(2);
  let active = 0;
  let peak = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const jobs = Array.from({ length: 4 }, () => bounded(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await gate;
    active -= 1;
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(peak, 2);
  release();
  await Promise.all(jobs);
});
