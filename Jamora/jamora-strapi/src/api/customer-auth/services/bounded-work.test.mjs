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

test("rejects excess queued password work with a typed overload", async () => {
  const bounded = createBoundedWork(1, 1);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const active = bounded(() => gate);
  const queued = bounded(() => gate);
  await assert.rejects(
    bounded(() => gate),
    (error) => error?.code === "password_work_overloaded",
  );
  release();
  await Promise.all([active, queued]);
});
