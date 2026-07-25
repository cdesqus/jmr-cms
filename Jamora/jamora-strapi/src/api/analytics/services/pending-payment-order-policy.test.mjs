import test from "node:test";
import assert from "node:assert/strict";
import {
  phase1MockOrderAllowed,
  authoritativeShippingCheckoutAllowed,
  pendingPaymentReservationToken,
  pendingCustomerSessionInput,
  pendingPaymentOrderBoundary,
} from "./pending-payment-order-policy.cjs";

test("pending order boundary uses the exact payment gate and storefront secret", () => {
  for (const value of [undefined, "", "TRUE", "1", "false"]) {
    assert.deepEqual(
      pendingPaymentOrderBoundary(
        { PAYMENTS_ENABLED: value, JAMORA_STOREFRONT_API_SECRET: "secret" },
        "secret",
      ),
      { status: 404, error: "Not found." },
    );
  }
  assert.deepEqual(
    pendingPaymentOrderBoundary({
      PAYMENTS_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, "attacker"),
    { status: 401, error: "Storefront API secret required." },
  );
  assert.equal(
    pendingPaymentOrderBoundary({
      PAYMENTS_ENABLED: "true",
      JAMORA_STOREFRONT_API_SECRET: "secret",
    }, "secret"),
    null,
  );
});

test("pending order identity is either a complete signed session or guest", () => {
  assert.equal(pendingCustomerSessionInput("", ""), null);
  assert.deepEqual(pendingCustomerSessionInput("customer-1", "4"), {
    documentId: "customer-1",
    sessionVersion: 4,
  });
  assert.throws(() => pendingCustomerSessionInput("customer-1", ""), /invalid session/i);
  assert.throws(() => pendingCustomerSessionInput("", "4"), /invalid session/i);
  assert.throws(() => pendingCustomerSessionInput("customer-1", "-1"), /invalid session/i);
});

test("Phase 2 cannot invoke the Phase 1 paid-order adapter", () => {
  assert.equal(phase1MockOrderAllowed({ PAYMENTS_ENABLED: "false" }, false), true);
  assert.equal(phase1MockOrderAllowed({ PAYMENTS_ENABLED: "true" }, true), true);
  assert.equal(phase1MockOrderAllowed({ PAYMENTS_ENABLED: "true" }, false), false);
});

test("authoritative shipping follows the enabled checkout transport", () => {
  assert.equal(authoritativeShippingCheckoutAllowed({
    SHIPPING_ENABLED: "true",
    PAYMENTS_ENABLED: "false",
  }, false), true);
  assert.equal(authoritativeShippingCheckoutAllowed({
    SHIPPING_ENABLED: "true",
    PAYMENTS_ENABLED: "true",
  }, true), true);
  assert.equal(authoritativeShippingCheckoutAllowed({
    SHIPPING_ENABLED: "true",
    PAYMENTS_ENABLED: "true",
  }, false), false);
  assert.equal(authoritativeShippingCheckoutAllowed({
    SHIPPING_ENABLED: "false",
    PAYMENTS_ENABLED: "false",
  }, false), false);
});

test("pending payment order requires an opaque stock reservation", () => {
  assert.equal(
    pendingPaymentReservationToken("  rsv_opaque-token  "),
    "rsv_opaque-token",
  );
  assert.throws(() => pendingPaymentReservationToken(""), /reservation/i);
  assert.throws(() => pendingPaymentReservationToken(123), /reservation/i);
});
