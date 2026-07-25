import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalRoPayPayload } from "./services/ropay-adapter.cjs";

const secret = "test-only-ropay-callback-secret-32-bytes";
const timestamp = "2026-07-25T12:00:00.000Z";
const payload = {
  providerEventId: "smoke-event-001",
  providerReference: "RPI-SMOKE-001",
  paymentReference: "JMR-ROPAY-SMOKE",
  status: "paid",
  amountMinor: 10_000,
  currency: "RON",
  occurredAt: "2026-07-25T12:00:01.000Z",
};

test("deployment HMAC recipe uses real LF delimiters and the adapter canonical payload", async () => {
  const deployment = await readFile(
    new URL("../../../../DEPLOYMENT.md", import.meta.url),
    "utf8",
  );
  assert.match(
    deployment,
    /ropay-callback\\n\$\{timestamp\}\\n\$\{body\}/,
  );
  assert.doesNotMatch(deployment, /ropay-callback\\\\n/);
  assert.match(deployment, /ropay-status\\n<timestamp>\\n<canonical-json>/);

  const body = canonicalRoPayPayload(payload);
  for (const kind of ["callback", "status"]) {
    const documented = `ropay-${kind}\n${timestamp}\n${body}`;
    const adapterContract = [
      `ropay-${kind}`,
      timestamp,
      canonicalRoPayPayload(payload),
    ].join("\n");
    assert.equal(documented, adapterContract);
    assert.equal(
      createHmac("sha256", secret).update(documented).digest("hex"),
      createHmac("sha256", secret).update(adapterContract).digest("hex"),
    );
  }
});
