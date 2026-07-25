import assert from "node:assert/strict";
import test from "node:test";
import Koa from "koa";

import serverConfig from "../../config/server.ts";

function env(values = {}) {
  const read = (name, fallback) => values[name] ?? fallback;
  read.int = (name, fallback) => Number(values[name] ?? fallback);
  read.array = (name) => values[name]?.split(",") ?? [];
  return read;
}

test("Strapi trusts forwarded client IP only with exact TRUST_PROXY=true", () => {
  for (const value of [undefined, "false", "TRUE", "1"]) {
    assert.equal(serverConfig({ env: env({ TRUST_PROXY: value }) }).proxy.koa, false);
  }
  assert.equal(serverConfig({ env: env({ TRUST_PROXY: "true" }) }).proxy.koa, true);
});

test("Koa derives ctx.ip from the client header only for the opt-in proxy configuration", () => {
  const request = {
    headers: { "x-forwarded-for": "198.51.100.8" },
    socket: { remoteAddress: "10.0.0.8" },
  };
  const response = {};
  for (const [trustProxy, expected] of [["false", "10.0.0.8"], ["true", "198.51.100.8"]]) {
    const app = new Koa();
    app.proxy = serverConfig({ env: env({ TRUST_PROXY: trustProxy }) }).proxy.koa;
    assert.equal(app.createContext(request, response).ip, expected);
  }
});
