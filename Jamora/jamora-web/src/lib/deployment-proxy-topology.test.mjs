import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const configurationPath = resolve(
  import.meta.dirname,
  "../../../deploy/nginx/jamora.conf",
);

function serverBlocks(configuration) {
  const blocks = [];
  const lines = configuration.split(/\r?\n/);
  let block = null;
  let depth = 0;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!block && line === "server {") {
      block = [];
      depth = 1;
      continue;
    }
    if (!block) continue;
    block.push(line);
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (depth === 0) {
      blocks.push(block);
      block = null;
    }
  }
  return blocks;
}

function topology(configuration) {
  return new Map(serverBlocks(configuration).map((lines) => {
    const serverName = lines
      .find((line) => line.startsWith("server_name "))
      ?.slice("server_name ".length)
      .replace(/;$/, "");
    const locations = [];
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^location(?:\s+(=|\^~))?\s+(\S+)\s+\{$/.exec(lines[index]);
      if (!match) continue;
      let depth = 1;
      let upstream = "";
      for (index += 1; index < lines.length && depth > 0; index += 1) {
        depth += (lines[index].match(/\{/g) ?? []).length;
        depth -= (lines[index].match(/\}/g) ?? []).length;
        const proxy = /^proxy_pass\s+(http:\/\/[^;]+);$/.exec(lines[index]);
        if (proxy) upstream = proxy[1];
      }
      index -= 1;
      locations.push({ modifier: match[1] ?? "", path: match[2], upstream });
    }
    return [serverName, locations];
  }));
}

function upstreamFor(locations, path) {
  const exact = locations.find((location) =>
    location.modifier === "=" && location.path === path);
  if (exact) return exact.upstream;
  return locations
    .filter((location) =>
      location.modifier !== "=" && path.startsWith(location.path))
    .sort((left, right) => right.path.length - left.path.length)[0]
    ?.upstream;
}

test("HTTPS topology keeps browser BFFs on Next and only explicit provider routes on Strapi", async () => {
  const configuration = await readFile(configurationPath, "utf8");
  const servers = topology(configuration);
  const publicLocations = servers.get("jamora.kaumtech.com");
  const cmsLocations = servers.get("cms.jamora.kaumtech.com");

  assert.ok(publicLocations);
  assert.ok(cmsLocations);
  for (const path of [
    "/api/jamora/orders/track",
    "/api/jamora/analytics/visit",
    "/api/jamora/shipping/quotes",
    "/api/jamora/customer/session",
    "/admin/api/shipping/shipments/order-1",
    "/admin/orders",
    "/api/jamora/payments/ropay/callback/extra",
  ]) {
    assert.equal(
      upstreamFor(publicLocations, path),
      "http://jamora_storefront",
      path,
    );
  }
  for (const path of [
    "/api/jamora/payments/ropay/callback",
    "/api/jamora/internal/payments/ropay/status",
    "/api/jamora/shipping/tracking/webhook",
    "/uploads/product.png",
  ]) {
    assert.equal(
      upstreamFor(publicLocations, path),
      "http://jamora_strapi",
      path,
    );
  }
  for (const path of ["/admin", "/api/products", "/content-manager"]) {
    assert.equal(
      upstreamFor(cmsLocations, path),
      "http://jamora_strapi",
      path,
    );
  }
});

test("HTTPS access logs exclude raw query strings and tracking capabilities", async () => {
  const configuration = await readFile(configurationPath, "utf8");
  const scrubbed = configuration
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .join("\n");
  const logFormat = /log_format\s+jamora_safe\s+([\s\S]*?);/.exec(scrubbed);

  assert.ok(logFormat, "jamora_safe log_format must be defined");
  assert.equal(/\$(request_uri|args|query_string|request)\b/.test(logFormat[1]), false);
  assert.match(logFormat[1], /\$uri\b/);
  assert.match(logFormat[1], /\$status\b/);
  assert.match(scrubbed, /access_log\s+\S+\s+jamora_safe;/);
});
