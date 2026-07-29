import assert from "node:assert/strict";
import test from "node:test";

import limiterModule from "./ropay-authenticated-limiter.cjs";

const { createRoPayAuthenticatedLimiter } = limiterModule;

function providerEvent(overrides = {}) {
  return {
    providerEventId: "event-1",
    providerReference: "RPI-1",
    paymentReference: "JMR-ROPAY-1",
    status: "paid",
    amountMinor: 10_000,
    currency: "RON",
    occurredAt: "2026-07-25T12:00:00.000Z",
    ...overrides,
  };
}

test("bounds distinct authenticated events without charging exact retries twice", () => {
  const limiter = createRoPayAuthenticatedLimiter({
    limit: 1,
    replayLimit: 2,
    windowMs: 60_000,
    maxBuckets: 2,
    now: () => 0,
  });

  assert.deepEqual(limiter.check(providerEvent()), {
    allowed: true,
    replay: false,
  });
  assert.deepEqual(limiter.check(providerEvent()), {
    allowed: true,
    replay: true,
  });
  assert.deepEqual(limiter.check(providerEvent()), {
    allowed: false,
    retryAfter: 60,
  });
  assert.deepEqual(
    limiter.check(providerEvent({
      providerEventId: "event-2",
      occurredAt: "2026-07-25T12:00:01.000Z",
    })),
    { allowed: false, retryAfter: 60 },
  );
});

test("changed semantics share their authenticated provider event retry bound", () => {
  const limiter = createRoPayAuthenticatedLimiter({
    limit: 1,
    replayLimit: 2,
    now: () => 0,
  });

  assert.equal(limiter.check(providerEvent()).allowed, true);
  assert.deepEqual(
    limiter.check(providerEvent({ status: "failed" })),
    { allowed: true, replay: false },
  );
  assert.equal(
    limiter.check(providerEvent({ amountMinor: 10_001 })).allowed,
    false,
  );
  assert.equal(limiter.bucketCount(), 1);
  assert.equal(limiter.eventCount(), 1);
});

test("authenticated limiter storage and expiry are bounded", () => {
  let now = 0;
  const limiter = createRoPayAuthenticatedLimiter({
    limit: 2,
    replayLimit: 3,
    windowMs: 1_000,
    maxBuckets: 2,
    now: () => now,
  });

  for (let index = 0; index < 20; index += 1) {
    limiter.check(providerEvent({
      providerReference: `RPI-${index}`,
      providerEventId: `event-${index}`,
    }));
  }
  assert.ok(limiter.bucketCount() <= 2);
  assert.ok(limiter.eventCount() <= 4);

  now = 1_000;
  assert.deepEqual(limiter.check(providerEvent()), {
    allowed: true,
    replay: false,
  });
});
