"use strict";

const {
  copyFile,
  mkdir,
  readdir,
  readFile,
} = require("node:fs/promises");
const path = require("node:path");

async function filesUnder(root, predicate) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (predicate(absolute)) found.push(absolute);
    }
  }
  try {
    await visit(root);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return found;
}

async function copyRuntimeCjsAssets(projectRoot = process.cwd()) {
  const sourceRoot = path.join(projectRoot, "src");
  const outputRoot = path.join(projectRoot, "dist", "src");
  const assets = await filesUnder(sourceRoot, (file) => file.endsWith(".cjs"));
  for (const source of assets) {
    const destination = path.join(outputRoot, path.relative(sourceRoot, source));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  return assets.length;
}

async function validateCompiledCjsDependencies(projectRoot = process.cwd()) {
  const outputRoot = path.join(projectRoot, "dist", "src");
  const compiled = await filesUnder(outputRoot, (file) => file.endsWith(".js"));
  const missing = [];
  const relativeCjs = /(?:require\(\s*|from\s+|import\(\s*)["'](\.[^"']+\.cjs)["']/g;
  for (const javascript of compiled) {
    const source = await readFile(javascript, "utf8");
    for (const match of source.matchAll(relativeCjs)) {
      const dependency = path.resolve(path.dirname(javascript), match[1]);
      try {
        require.resolve(dependency);
      } catch {
        missing.push(dependency);
      }
    }
  }
  if (missing.length) {
    throw new Error(`Missing compiled CJS dependencies:\n${[...new Set(missing)].join("\n")}`);
  }
  return compiled.length;
}

async function main() {
  const copied = await copyRuntimeCjsAssets();
  const validated = await validateCompiledCjsDependencies();
  process.stdout.write(`Packaged ${copied} runtime CJS assets; validated ${validated} compiled JS files.\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { copyRuntimeCjsAssets, validateCompiledCjsDependencies };
