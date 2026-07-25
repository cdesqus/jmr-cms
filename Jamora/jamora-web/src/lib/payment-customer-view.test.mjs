import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptedPaymentMethods,
  checkoutAttempt,
  mergePaymentSnapshot,
  paymentPreparationRequest,
  pendingCheckoutOrderState,
  paymentStatusView,
  shouldPollPayment,
  snapshotInstructionRows,
} from "./payment-customer-view.cjs";

test("manual transfer remains selected and RoPay appears only in the server allowlist", () => {
  assert.deepEqual(acceptedPaymentMethods(undefined), ["bank_transfer"]);
  assert.deepEqual(acceptedPaymentMethods({ methods: [] }), ["bank_transfer"]);
  assert.deepEqual(
    acceptedPaymentMethods({ methods: ["ropay", "bank_transfer", "fake"] }),
    ["bank_transfer", "ropay"],
  );
});

test("only verified paid server state renders paid and terminal states stop polling", () => {
  assert.deepEqual(paymentStatusView("pending_provider"), {
    tone: "pending",
    label: "Payment pending",
    paid: false,
  });
  assert.deepEqual(paymentStatusView("paid"), {
    tone: "paid",
    label: "Payment confirmed",
    paid: true,
  });
  for (const status of ["paid", "expired", "cancelled", "failed", "refunded"]) {
    assert.equal(shouldPollPayment(status), false);
  }
  assert.equal(shouldPollPayment("awaiting_payment"), true);
  assert.equal(shouldPollPayment("pending_provider"), true);
  assert.equal(shouldPollPayment("underpaid"), true);
  assert.equal(shouldPollPayment("overpaid"), true);
  assert.equal(shouldPollPayment("currency_mismatch"), true);
});

test("terminal status refresh removes provider action links", () => {
  const current = {
    method: "ropay",
    status: "pending_provider",
    paymentReference: "JMR-ROPAY-123",
    amountMinor: 12345,
    currency: "RON",
    expiresAt: "2026-07-25T10:00:00.000Z",
    qrUrl: "https://mock.ropay.invalid/qr/token",
    deepLink: "ropay://pay/token",
  };
  assert.deepEqual(mergePaymentSnapshot(current, {
    method: "ropay",
    status: "paid",
    paymentReference: "JMR-ROPAY-123",
    amountMinor: 12345,
    currency: "RON",
    expiresAt: "2026-07-25T10:00:00.000Z",
  }), {
    method: "ropay",
    status: "paid",
    paymentReference: "JMR-ROPAY-123",
    amountMinor: 12345,
    currency: "RON",
    expiresAt: "2026-07-25T10:00:00.000Z",
  });
  assert.equal(
    mergePaymentSnapshot(current, { ...current, qrUrl: undefined, deepLink: undefined })
      .qrUrl,
    "https://mock.ropay.invalid/qr/token",
  );
  assert.equal(
    mergePaymentSnapshot(undefined, {
      ...current,
      expiresAt: "2026-07-25T09:59:59.000Z",
    }, new Date("2026-07-25T10:00:00.000Z")).qrUrl,
    undefined,
  );
});

test("checkout retries reuse one coherent attempt until checkout input changes", () => {
  let generated = 0;
  const makeKey = () => `attempt-${++generated}`;
  const first = checkoutAttempt(null, "cart-and-customer-a", makeKey);
  first.reservationToken = "reservation-1";
  assert.equal(checkoutAttempt(first, "cart-and-customer-a", makeKey), first);
  assert.equal(generated, 1);
  const changed = checkoutAttempt(first, "cart-and-customer-b", makeKey);
  assert.notEqual(changed, first);
  assert.equal(changed.key, "attempt-2");
});

test("manual instruction rows preserve the authoritative snapshot values exactly", () => {
  const snapshot = {
    method: "bank_transfer",
    status: "awaiting_payment",
    paymentReference: "JMR-BANK-123",
    amountMinor: 12345,
    currency: "RON",
    expiresAt: "2026-07-28T10:00:00.000Z",
    beneficiary: {
      name: "Jamora SRL",
      iban: "RO49AAAA1B31007593840000",
      bank: "Jamora Bank",
    },
  };
  assert.deepEqual(snapshotInstructionRows(snapshot), [
    ["Beneficiary", "Jamora SRL"],
    ["Bank", "Jamora Bank"],
    ["IBAN", "RO49AAAA1B31007593840000"],
    ["Reference", "JMR-BANK-123"],
    ["Amount", { amountMinor: 12345, currency: "RON" }],
    ["Expires", "2026-07-28T10:00:00.000Z"],
  ]);
});

test("preparation requests bind ordinary, purchase, and renewal purposes exactly", () => {
  assert.deepEqual(paymentPreparationRequest("bank_transfer", {
    idempotencyKey: "pay:order-1",
    subjectType: "order",
    subjectId: "order-1",
    purpose: "order",
    currency: "RON",
    guestCheckoutCapability: "reservation-1",
  }), {
    endpoint: "/api/jamora/payments/bank-transfer",
    body: {
      idempotencyKey: "pay:order-1",
      subjectType: "order",
      subjectId: "order-1",
      purpose: "order",
      currency: "RON",
      guestCheckoutCapability: "reservation-1",
    },
  });
  assert.equal(paymentPreparationRequest("ropay", {
    idempotencyKey: "pay:purchase-1",
    subjectType: "membership",
    subjectId: "membership-1",
    purpose: "membership_purchase",
    currency: "RON",
  }).body.purpose, "membership_purchase");
  assert.equal(paymentPreparationRequest("bank_transfer", {
    idempotencyKey: "pay:renew-1",
    subjectType: "membership",
    subjectId: "membership-2",
    purpose: "membership_renewal",
    currency: "RON",
  }).body.purpose, "membership_renewal");
  assert.throws(() => paymentPreparationRequest("ropay", {
    idempotencyKey: "bad",
    subjectType: "order",
    subjectId: "order-1",
    purpose: "membership_purchase",
    currency: "RON",
  }), /subject and purpose/i);
});

test("customer checkout no longer creates a locally auto-confirmed order", () => {
  assert.deepEqual(
    pendingCheckoutOrderState("order-1", "2026-07-25T10:00:00.000Z"),
    {
      status: "pending",
      emailConfirmationSent: false,
      statusHistory: [{
        id: "evt-order-1-pending-payment",
        type: "status",
        status: "pending",
        note: "Awaiting payment confirmation.",
        actor: "Checkout",
        createdAt: "2026-07-25T10:00:00.000Z",
      }],
    },
  );
});
