import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import paymentTransactionModule from "./payment-transaction.cjs";
import ropayModule from "./ropay-adapter.cjs";

const {
  assertAuthoritativePaymentSubjectBinding,
  createMemoryPaymentAdapter,
} = paymentTransactionModule;
const {
  canonicalRoPayPayload,
  createRoPayIntent,
  handleRoPayCallback,
  readRoPayStatus,
  verifyRoPayCallback,
  verifyRoPayStatus,
} = ropayModule;

const secret = "test-only-ropay-callback-secret-32-bytes";
const now = new Date("2026-07-25T12:00:00.000Z");
const enabled = {
  PAYMENTS_ENABLED: "true",
  ROPAY_ENABLED: "true",
  ROPAY_PROVIDER_MODE: "mock",
  ROPAY_CALLBACK_SECRET: secret,
  ROPAY_INTENT_TTL_SECONDS: "600",
};

function subject() {
  return {
    subjectType: "order",
    subjectId: "order-1",
    ownerDocumentId: "customer-1",
    customerDocumentId: "customer-1",
    purpose: "order",
    orderDocumentId: "order-1",
    amountMinor: 10_000,
    currency: "RON",
    priceSnapshot: {
      charge: { amountMinor: 10_000, currency: "RON" },
    },
  };
}

function payment(overrides = {}) {
  return {
    documentId: "payment-1",
    paymentNumber: "PAY-1",
    idempotencyKey: "intent-1",
    subjectType: "order",
    subjectId: "order-1",
    ownerDocumentId: "customer-1",
    customerDocumentId: "customer-1",
    purpose: "order",
    orderDocumentId: "order-1",
    method: "ropay",
    provider: "ropay_mock",
    providerReference: "RPI-1",
    paymentReference: "JMR-ROPAY-1",
    status: "pending_provider",
    amountMinor: 10_000,
    currency: "RON",
    expiresAt: "2026-07-25T12:10:00.000Z",
    priceSnapshot: {
      charge: { amountMinor: 10_000, currency: "RON" },
      ropay: {
        sessionToken: "public-session-token",
        displayExpiresAt: "2026-07-25T12:10:00.000Z",
      },
    },
    ...overrides,
  };
}

function payload(overrides = {}) {
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

function signedRequest(body = payload(), kind = "callback", timestamp = now.toISOString()) {
  const message = `ropay-${kind}\n${timestamp}\n${canonicalRoPayPayload(body)}`;
  return {
    payload: body,
    timestamp,
    signature: `sha256=${createHmac("sha256", secret).update(message).digest("hex")}`,
    providerReference: body.providerReference,
  };
}

function signedUnrestrictedRequest(
  body,
  kind = "callback",
  timestamp = now.toISOString(),
) {
  const canonical = JSON.stringify({
    providerEventId: body.providerEventId,
    providerReference: body.providerReference,
    paymentReference: body.paymentReference,
    status: body.status,
    amountMinor: body.amountMinor,
    currency: body.currency,
    occurredAt: body.occurredAt,
  });
  const message = `ropay-${kind}\n${timestamp}\n${canonical}`;
  return {
    payload: body,
    timestamp,
    signature: `sha256=${createHmac("sha256", secret).update(message).digest("hex")}`,
    providerReference: body.providerReference,
  };
}

test("canonical payload has one stable allowlisted representation", () => {
  assert.equal(
    canonicalRoPayPayload(payload()),
    '{"providerEventId":"event-1","providerReference":"RPI-1","paymentReference":"JMR-ROPAY-1","status":"paid","amountMinor":10000,"currency":"RON","occurredAt":"2026-07-25T12:00:00.000Z"}',
  );
  assert.throws(
    () => canonicalRoPayPayload({ ...payload(), untrusted: true }),
    /unexpected field/i,
  );
});

test("verifies a current HMAC callback and rejects invalid, malformed, or stale signatures", () => {
  assert.deepEqual(
    verifyRoPayCallback(signedRequest(), { secret, now }),
    payload(),
  );
  for (const request of [
    { ...signedRequest(), signature: `sha256=${"0".repeat(64)}` },
    { ...signedRequest(), signature: "sha256=short" },
    signedRequest(payload(), "callback", "2026-07-25T11:54:59.000Z"),
  ]) {
    assert.throws(
      () => verifyRoPayCallback(request, { secret, now }),
      /verification failed/i,
    );
  }
});

test("status verification uses a separate signed server-to-server domain", () => {
  const statusRequest = signedRequest(payload(), "status");
  assert.deepEqual(verifyRoPayStatus(statusRequest, { secret, now }), payload());
  assert.throws(
    () => verifyRoPayStatus(signedRequest(), { secret, now }),
    /verification failed/i,
  );
});

test("signed provider reference must match the pre-body rate-limit reference", () => {
  for (const [request, verify] of [
    [signedRequest(), verifyRoPayCallback],
    [signedRequest(payload(), "status"), verifyRoPayStatus],
  ]) {
    assert.throws(
      () => verify(
        { ...request, providerReference: "RPI-OTHER" },
        { secret, now },
      ),
      /verification failed/i,
    );
  }
});

test("signed callback and status payloads reject non-RON currency", () => {
  const eur = payload({ currency: "EUR" });
  assert.throws(
    () => verifyRoPayCallback(
      signedUnrestrictedRequest(eur),
      { secret, now },
    ),
    /verification failed/i,
  );
  assert.throws(
    () => verifyRoPayStatus(
      signedUnrestrictedRequest(eur, "status"),
      { secret, now },
    ),
    /verification failed/i,
  );
});

test("persists an immutable intent before creating a short-lived safe QR and deep link DTO", async () => {
  let providerSawPersisted = false;
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async () => subject(),
  });
  const result = await createRoPayIntent(adapter, {
    ...subject(),
    idempotencyKey: "intent-1",
    now,
  }, {
    env: enabled,
    randomUUID: (() => {
      const values = [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
        "00000000-0000-4000-8000-000000000004",
      ];
      return () => values.shift();
    })(),
    createProviderPresentation(providerInput) {
      assert.deepEqual(Object.keys(providerInput).sort(), [
        "amountMinor",
        "currency",
        "expiresAt",
        "paymentDocumentId",
        "paymentReference",
        "providerReference",
        "sessionToken",
      ]);
      providerSawPersisted = adapter.payments.has(providerInput.paymentDocumentId);
      return {
        qrUrl: `https://mock.ropay.invalid/qr/${providerInput.sessionToken}`,
        deepLink: `ropay://pay/${providerInput.sessionToken}`,
      };
    },
  });

  assert.equal(providerSawPersisted, true);
  assert.deepEqual(Object.keys(result).sort(), [
    "amountMinor",
    "currency",
    "deepLink",
    "expiresAt",
    "method",
    "paymentReference",
    "qrUrl",
    "status",
  ]);
  assert.match(result.qrUrl, /^https:\/\/mock\.ropay\.invalid\/qr\/[A-Za-z0-9_-]+$/);
  assert.match(result.deepLink, /^ropay:\/\/pay\/[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes("signature"), false);

  const persisted = [...adapter.payments.values()][0];
  assert.equal(persisted.method, "ropay");
  assert.equal(persisted.provider, "ropay_mock");
  assert.equal(persisted.status, "pending_provider");
  assert.equal(persisted.amountMinor, 10_000);
  assert.equal(persisted.currency, "RON");
  assert.ok(persisted.providerReference);
  assert.ok(persisted.paymentReference);
});

test("forces RON into authoritative subject resolution when request currency is omitted", async () => {
  let resolvedInput;
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async (input) => {
      resolvedInput = input;
      return subject();
    },
  });
  const input = {
    ...subject(),
    idempotencyKey: "intent-ron",
    now,
  };
  delete input.currency;

  const result = await createRoPayIntent(adapter, input, {
    env: enabled,
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });

  assert.equal(resolvedInput.currency, "RON");
  assert.equal(result.currency, "RON");
});

test("rejects an explicit EUR intent before authoritative subject resolution", async () => {
  let resolverCalls = 0;
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async () => {
      resolverCalls += 1;
      return subject();
    },
  });
  await assert.rejects(
    () => createRoPayIntent(adapter, {
      ...subject(),
      currency: "EUR",
      idempotencyKey: "intent-eur-request",
      now,
    }, { env: enabled }),
    /currency.*RON/i,
  );
  assert.equal(resolverCalls, 0);
  assert.equal(adapter.payments.size, 0);
});

test("rejects an authoritative subject that cannot settle in RON", async () => {
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async () => ({
      ...subject(),
      currency: "EUR",
      priceSnapshot: {
        charge: { amountMinor: 10_000, currency: "EUR" },
      },
    }),
  });
  await assert.rejects(
    () => createRoPayIntent(adapter, {
      ...subject(),
      idempotencyKey: "intent-eur-subject",
      now,
    }, { env: enabled }),
    /currency.*RON/i,
  );
  assert.equal(adapter.payments.size, 0);
});

test("rejects replay of a previously persisted non-RON RoPay intent", async () => {
  const adapter = createMemoryPaymentAdapter({
    payments: [payment({
      currency: "EUR",
      priceSnapshot: {
        charge: { amountMinor: 10_000, currency: "EUR" },
        ropay: payment().priceSnapshot.ropay,
      },
    })],
  });
  await assert.rejects(
    () => createRoPayIntent(adapter, {
      ...subject(),
      idempotencyKey: "intent-1",
      now,
    }, { env: enabled }),
    /idempotency conflict|currency.*RON/i,
  );
});

test("rejects an already-expired authoritative subject before persisting an intent", async () => {
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async () => ({
      ...subject(),
      subjectExpiresAt: "2026-07-25T11:59:59.000Z",
    }),
  });
  await assert.rejects(
    () => createRoPayIntent(adapter, {
      ...subject(),
      idempotencyKey: "intent-expired-subject",
      now,
    }, { env: enabled }),
    /subject.*expired/i,
  );
  assert.equal(adapter.payments.size, 0);
});

test("intent replay returns the persisted provider presentation and conflicts on changed identity", async () => {
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async () => subject(),
  });
  const input = { ...subject(), idempotencyKey: "intent-1", now };
  const first = await createRoPayIntent(adapter, input, {
    env: enabled,
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  const replay = await createRoPayIntent(adapter, input, {
    env: enabled,
    randomUUID: () => "00000000-0000-4000-8000-000000000099",
  });
  assert.deepEqual(replay, first);
  assert.ok(replay.qrUrl);
  assert.ok(replay.deepLink);
  assert.equal(adapter.payments.size, 1);
  await assert.rejects(
    () => createRoPayIntent(adapter, {
      ...input,
      subjectId: "order-2",
    }, { env: enabled }),
    /idempotency conflict/i,
  );
  const replayWithForgedMoney = await createRoPayIntent(adapter, {
      ...input,
      amountMinor: 9_999,
    }, { env: enabled });
  assert.equal(replayWithForgedMoney.amountMinor, 10_000);
});

test("terminal intent replay returns status only without reusable provider presentation", async () => {
  for (const status of ["paid", "failed", "expired"]) {
    const adapter = createMemoryPaymentAdapter({
      payments: [payment({ status })],
    });
    const result = await createRoPayIntent(adapter, {
      ...subject(),
      idempotencyKey: "intent-1",
      now,
    }, { env: enabled });

    assert.equal(result.status, status);
    assert.equal(Object.hasOwn(result, "qrUrl"), false);
    assert.equal(Object.hasOwn(result, "deepLink"), false);
  }
});

test("time-expired pending intent replay rejects instead of returning stale QR data", async () => {
  const adapter = createMemoryPaymentAdapter({
    payments: [payment({
      expiresAt: "2026-07-25T11:59:59.000Z",
      priceSnapshot: {
        ...payment().priceSnapshot,
        ropay: {
          sessionToken: "public-session-token",
          displayExpiresAt: "2026-07-25T11:59:59.000Z",
        },
      },
    })],
  });
  await assert.rejects(
    () => createRoPayIntent(adapter, {
      ...subject(),
      idempotencyKey: "intent-1",
      now,
    }, { env: enabled }),
    /intent expired/i,
  );
});

test("dual exact gates reject RoPay without disabling the manual transaction foundation", async () => {
  for (const patch of [
    { PAYMENTS_ENABLED: "TRUE" },
    { ROPAY_ENABLED: "1" },
    { ROPAY_PROVIDER_MODE: "live" },
  ]) {
    const adapter = createMemoryPaymentAdapter({
      resolvePaymentSubject: async () => subject(),
    });
    await assert.rejects(
      () => createRoPayIntent(adapter, {
        ...subject(),
        idempotencyKey: "intent-gated",
        now,
      }, { env: { ...enabled, ...patch } }),
      /not found/i,
    );
    assert.equal(adapter.payments.size, 0);
  }
});

test("a valid callback settles once and an exact provider event replay is idempotent", async () => {
  let settlements = 0;
  const adapter = createMemoryPaymentAdapter({
    payments: [payment()],
    validateSettlementSubject: async (persisted) =>
      assertAuthoritativePaymentSubjectBinding(persisted, subject()),
    settleSubject: async () => { settlements += 1; },
  });
  const options = {
    env: enabled,
    now: () => now,
    randomUUID: () => "00000000-0000-4000-8000-000000000010",
  };
  const first = await handleRoPayCallback(adapter, signedRequest(), options);
  const replay = await handleRoPayCallback(adapter, signedRequest(), options);

  assert.equal(first.status, "paid");
  assert.equal(first.idempotent, false);
  assert.equal(replay.status, "paid");
  assert.equal(replay.idempotent, true);
  assert.equal(settlements, 1);
  assert.equal(adapter.events.filter((event) => event.providerEventId === "event-1").length, 1);
});

test("the same immutable provider event replays across callback and status transports", async () => {
  let settlements = 0;
  const adapter = createMemoryPaymentAdapter({
    payments: [payment()],
    settleSubject: async () => { settlements += 1; },
  });
  const options = { env: enabled, now: () => now };

  const callback = await handleRoPayCallback(
    adapter,
    signedRequest(payload(), "callback"),
    options,
  );
  const statusReplay = await handleRoPayCallback(
    adapter,
    signedRequest(payload(), "status"),
    { ...options, verification: "status" },
  );

  assert.equal(callback.idempotent, false);
  assert.equal(statusReplay.idempotent, true);
  assert.equal(statusReplay.status, "paid");
  assert.equal(settlements, 1);
  assert.equal(adapter.events.length, 1);
  assert.deepEqual(adapter.events[0].payload, {
    kind: "ropay_provider_event",
    providerEvent: payload(),
  });
});

test("cross-channel provider event replay conflicts when immutable semantics change", async () => {
  const adapter = createMemoryPaymentAdapter({
    payments: [payment()],
    settleSubject: async () => undefined,
  });
  const options = { env: enabled, now: () => now };
  await handleRoPayCallback(adapter, signedRequest(), options);
  await assert.rejects(
    () => handleRoPayCallback(
      adapter,
      signedRequest(payload({ status: "failed" }), "status"),
      { ...options, verification: "status" },
    ),
    /idempotency conflict/i,
  );
});

test("a distinct later paid status is recorded as observation without paid-to-paid mutation", async () => {
  let settlements = 0;
  const adapter = createMemoryPaymentAdapter({
    payments: [payment()],
    settleSubject: async () => { settlements += 1; },
  });
  const options = { env: enabled, now: () => now };
  await handleRoPayCallback(adapter, signedRequest(), options);

  const observation = payload({
    providerEventId: "event-2",
    occurredAt: "2026-07-25T12:00:01.000Z",
  });
  const result = await handleRoPayCallback(
    adapter,
    signedRequest(observation, "status"),
    { ...options, verification: "status" },
  );

  assert.equal(result.status, "paid");
  assert.equal(result.idempotent, true);
  assert.equal(settlements, 1);
  assert.equal(adapter.events.length, 2);
  assert.equal(adapter.events[1].providerEventId, "event-2");
  assert.deepEqual(adapter.events[1].payload.providerEvent, observation);
});

test("a replayed provider event with changed signed semantics conflicts", async () => {
  const adapter = createMemoryPaymentAdapter({
    payments: [payment()],
    settleSubject: async () => undefined,
  });
  const options = { env: enabled, now: () => now };
  await handleRoPayCallback(adapter, signedRequest(), options);
  await assert.rejects(
    () => handleRoPayCallback(
      adapter,
      signedRequest(payload({ status: "failed" })),
      options,
    ),
    /idempotency conflict/i,
  );
});

test("a paid event replay requires coherent persisted settlement state", async () => {
  const providerEvent = payload();
  const adapter = createMemoryPaymentAdapter({
    payments: [payment()],
    events: [{
      eventId: "internal-event-1",
      paymentDocumentId: "payment-1",
      transition: "paid",
      actor: "ropay",
      providerEventId: providerEvent.providerEventId,
      occurredAt: providerEvent.occurredAt,
      payload: {
        kind: "ropay_provider_event",
        providerEvent,
      },
    }],
  });
  await assert.rejects(
    () => handleRoPayCallback(adapter, signedRequest(), {
      env: enabled,
      now: () => now,
    }),
    /idempotency conflict/i,
  );
});

test("invalid signature and immutable amount, currency, payment, or provider reference mismatches never settle", async () => {
  for (const request of [
    { ...signedRequest(), signature: `sha256=${"f".repeat(64)}` },
    signedRequest(payload({ amountMinor: 9_999 })),
    signedUnrestrictedRequest(payload({ currency: "EUR" })),
    signedRequest(payload({ paymentReference: "JMR-OTHER" })),
    signedRequest(payload({ providerReference: "RPI-OTHER" })),
  ]) {
    let settlements = 0;
    const adapter = createMemoryPaymentAdapter({
      payments: [payment()],
      settleSubject: async () => { settlements += 1; },
    });
    await assert.rejects(
      () => handleRoPayCallback(adapter, request, {
        env: enabled,
        now: () => now,
      }),
      /verification failed|mismatch|not found/i,
    );
    assert.equal(adapter.payments.get("payment-1").status, "pending_provider");
    assert.equal(settlements, 0);
  }
});

test("out-of-order provider events and failure after paid cannot regress payment state", async () => {
  const prior = {
    eventId: "internal-event-1",
    paymentDocumentId: "payment-1",
    transition: "pending_provider",
    actor: "ropay",
    providerEventId: "event-newer",
    occurredAt: "2026-07-25T12:00:01.000Z",
    payload: {
      kind: "ropay_provider_event",
      providerEvent: payload({
        providerEventId: "event-newer",
        status: "pending",
        occurredAt: "2026-07-25T12:00:01.000Z",
      }),
    },
  };
  const pending = createMemoryPaymentAdapter({
    payments: [payment()],
    events: [prior],
  });
  await assert.rejects(
    () => handleRoPayCallback(
      pending,
      signedRequest(payload({
        providerEventId: "event-older",
        status: "failed",
        occurredAt: "2026-07-25T12:00:00.000Z",
      })),
      { env: enabled, now: () => now },
    ),
    /out of order/i,
  );

  const paid = createMemoryPaymentAdapter({
    payments: [payment({
      status: "paid",
      paidAt: "2026-07-25T12:00:00.000Z",
      settlementKey: "payment:payment-1:settle",
      receivedAmountMinor: 10_000,
      receivedCurrency: "RON",
      receivedAt: "2026-07-25T12:00:00.000Z",
    })],
  });
  await assert.rejects(
    () => handleRoPayCallback(
      paid,
      signedRequest(payload({
        providerEventId: "event-failed",
        status: "failed",
        occurredAt: "2026-07-25T12:00:01.000Z",
      })),
      { env: enabled, now: () => now },
    ),
    /cannot transition/i,
  );
  assert.equal(paid.payments.get("payment-1").status, "paid");
});

test("a provider event dated before the persisted intent is rejected as out of order", async () => {
  const adapter = createMemoryPaymentAdapter({
    payments: [payment()],
    events: [{
      eventId: "intent-event",
      paymentDocumentId: "payment-1",
      transition: "pending_provider",
      actor: "system",
      providerEventId: "ropay-intent:intent-1",
      occurredAt: "2026-07-25T12:00:01.000Z",
      payload: { kind: "ropay_intent" },
    }],
  });
  await assert.rejects(
    () => handleRoPayCallback(adapter, signedRequest(), {
      env: enabled,
      now: () => now,
    }),
    /out of order/i,
  );
  assert.equal(adapter.payments.get("payment-1").status, "pending_provider");
});

test("signed server-to-server status may settle but read-only browser status cannot mutate", async () => {
  let transactions = 0;
  const base = createMemoryPaymentAdapter({
    payments: [payment()],
    settleSubject: async () => undefined,
  });
  const adapter = {
    ...base,
    async transaction(work) {
      transactions += 1;
      return base.transaction(work);
    },
  };

  const status = await readRoPayStatus(adapter, {
    paymentReference: "JMR-ROPAY-1",
    customerDocumentId: "customer-1",
  }, { env: enabled });
  assert.deepEqual(status, {
    method: "ropay",
    status: "pending_provider",
    paymentReference: "JMR-ROPAY-1",
    amountMinor: 10_000,
    currency: "RON",
    expiresAt: "2026-07-25T12:10:00.000Z",
  });
  assert.equal(transactions, 0);
  assert.equal(base.payments.get("payment-1").status, "pending_provider");

  const settled = await handleRoPayCallback(
    adapter,
    signedRequest(payload(), "status"),
    { env: enabled, now: () => now, verification: "status" },
  );
  assert.equal(settled.status, "paid");
  assert.equal(transactions, 1);
});
