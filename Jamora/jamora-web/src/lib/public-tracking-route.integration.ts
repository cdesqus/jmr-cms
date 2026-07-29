import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/jamora/orders/track/route";

const access = `trk_${"A".repeat(43)}`;
const originalFetch = globalThis.fetch;
const originalEnv = {
  TRUST_PROXY: process.env.TRUST_PROXY,
  JAMORA_STOREFRONT_API_SECRET:
    process.env.JAMORA_STOREFRONT_API_SECRET,
};

function request(
  ip: string,
  query = "",
  downstreamSpoof = "browser-forged",
) {
  return new Request(`http://localhost/api/jamora/orders/track${query}`, {
    headers: {
      "x-real-ip": ip,
      "x-jamora-tracking-client-key": downstreamSpoof,
      "x-jamora-tracking-client-timestamp": "1785311000",
      "x-jamora-tracking-client-signature": "0".repeat(64),
    },
  });
}

test.after(() => {
  globalThis.fetch = originalFetch;
  process.env.TRUST_PROXY = originalEnv.TRUST_PROXY;
  process.env.JAMORA_STOREFRONT_API_SECRET =
    originalEnv.JAMORA_STOREFRONT_API_SECRET;
});

test("actual tracking route bounds malformed spray before any Strapi call", async () => {
  process.env.TRUST_PROXY = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET =
    "storefront-boundary-secret-at-least-32-bytes";
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ order: {} });
  };

  for (let index = 0; index < 30; index += 1) {
    assert.equal((await GET(request("198.51.100.40"))).status, 404);
  }
  const blocked = await GET(request("198.51.100.40"));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "60");
  assert.deepEqual(await blocked.json(), {
    error: "Request could not be completed.",
  });
  assert.equal(upstreamCalls, 0);
});

test("actual tracking route isolates two proxy-derived browser identities", async () => {
  process.env.TRUST_PROXY = "true";
  process.env.JAMORA_STOREFRONT_API_SECRET =
    "storefront-boundary-secret-at-least-32-bytes";
  let upstreamCalls = 0;
  globalThis.fetch = async (_input, init) => {
    upstreamCalls += 1;
    const headers = new Headers(init?.headers);
    assert.notEqual(
      headers.get("x-jamora-tracking-client-key"),
      "browser-forged",
    );
    return Response.json({ order: { orderNumber: "JMR-1" } });
  };

  for (let index = 0; index < 30; index += 1) {
    assert.equal((await GET(request("198.51.100.41"))).status, 404);
  }
  assert.equal((await GET(request("198.51.100.41"))).status, 429);

  const isolated = await GET(request(
    "198.51.100.42",
    `?q=JMR-1&access=${access}`,
  ));
  assert.equal(isolated.status, 200);
  assert.equal(upstreamCalls, 1);
});

test("actual tracking route ignores spoofed IP when proxy trust is off", async () => {
  process.env.TRUST_PROXY = "false";
  process.env.JAMORA_STOREFRONT_API_SECRET =
    "storefront-boundary-secret-at-least-32-bytes";
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ order: {} });
  };

  for (let index = 0; index < 30; index += 1) {
    const spoofed = index % 2 === 0
      ? "198.51.100.43"
      : "203.0.113.43";
    assert.equal((await GET(request(spoofed))).status, 404);
  }
  const blocked = await GET(request("192.0.2.43"));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "60");
  assert.equal(upstreamCalls, 0);
});
