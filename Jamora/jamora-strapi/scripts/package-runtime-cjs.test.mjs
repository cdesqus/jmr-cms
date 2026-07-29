import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  copyRuntimeCjsAssets,
  validateCompiledCjsDependencies,
} from "./package-runtime-cjs.cjs";

test("recursively copies every source CJS asset to the same dist/src path", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "jamora-cjs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src", "api", "nested"), { recursive: true });
  await writeFile(path.join(root, "src", "root.cjs"), "root");
  await writeFile(path.join(root, "src", "api", "nested", "runtime.cjs"), "nested");

  const copied = await copyRuntimeCjsAssets(root);

  assert.equal(copied, 2);
  assert.equal(await readFile(path.join(root, "dist", "src", "root.cjs"), "utf8"), "root");
  assert.equal(await readFile(path.join(root, "dist", "src", "api", "nested", "runtime.cjs"), "utf8"), "nested");
});

test("validator rejects a compiled relative CJS dependency that was not packaged", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "jamora-cjs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const compiled = path.join(root, "dist", "src", "api");
  await mkdir(compiled, { recursive: true });
  await writeFile(path.join(compiled, "route.js"), 'require("./missing.cjs");');

  await assert.rejects(
    validateCompiledCjsDependencies(root),
    /missing\.cjs/,
  );
});
