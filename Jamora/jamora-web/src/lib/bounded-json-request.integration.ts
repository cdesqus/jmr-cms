import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundedJsonError,
  readBoundedJsonObject,
} from "./bounded-json-request";

function streamingRequest(
  stream: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  return new Request("https://storefront.test/api/jamora/shipping/quotes", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("rejects oversized Content-Length before reading the request stream", async () => {
  const request = streamingRequest(new ReadableStream({
    pull() {},
  }), { "content-length": "4097" });

  await assert.rejects(
    readBoundedJsonObject(request, 4_096),
    (error: unknown) =>
      error instanceof BoundedJsonError && error.status === 413,
  );
  assert.equal(request.bodyUsed, false);
});

test("cancels a chunked request as soon as it crosses the byte limit", async () => {
  let cancelled = false;
  const chunks = [
    new Uint8Array(3_000).fill(32),
    new Uint8Array(1_097).fill(32),
    new TextEncoder().encode('{"never":"read"}'),
  ];
  const request = streamingRequest(new ReadableStream({
    pull(controller) {
      const next = chunks.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  }));

  await assert.rejects(
    readBoundedJsonObject(request, 4_096),
    (error: unknown) =>
      error instanceof BoundedJsonError && error.status === 413,
  );
  assert.equal(cancelled, true);
  assert.equal(chunks.length, 1);
});

test("counts UTF-8 bytes across chunks and parses one bounded object", async () => {
  const value = { query: `stradă ${"a".repeat(4_070)}` };
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  assert.equal(encoded.byteLength <= 4_096, true);
  const request = streamingRequest(new ReadableStream({
    start(controller) {
      controller.enqueue(encoded.slice(0, 17));
      controller.enqueue(encoded.slice(17));
      controller.close();
    },
  }));

  assert.deepEqual(await readBoundedJsonObject(request, 4_096), value);
});

test("rejects malformed JSON and non-object JSON with status 400", async () => {
  for (const body of ["{", "[]", '"text"', "null"]) {
    const request = new Request("https://storefront.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await assert.rejects(
      readBoundedJsonObject(request, 4_096),
      (error: unknown) =>
        error instanceof BoundedJsonError && error.status === 400,
    );
  }
});
