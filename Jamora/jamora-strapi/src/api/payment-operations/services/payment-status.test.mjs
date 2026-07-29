import test from "node:test";
import assert from "node:assert/strict";
import { authorizePaymentStatus } from "./payment-status.cjs";

test("payment status access binds the exact signed customer or guest capability", () => {
  const customerPayment = {
    ownerDocumentId: "customer-1",
    customerDocumentId: "customer-1",
  };
  assert.equal(
    authorizePaymentStatus(customerPayment, { customerDocumentId: "customer-1" }),
    customerPayment,
  );
  assert.throws(
    () => authorizePaymentStatus(customerPayment, { customerDocumentId: "customer-2" }),
    /not found/i,
  );
  assert.throws(
    () => authorizePaymentStatus(customerPayment, { guestCheckoutCapability: "customer-1" }),
    /not found/i,
  );

  const guestPayment = { ownerDocumentId: "guest:reservation-1" };
  assert.equal(
    authorizePaymentStatus(guestPayment, { guestCheckoutCapability: "reservation-1" }),
    guestPayment,
  );
  assert.throws(
    () => authorizePaymentStatus(guestPayment, { guestCheckoutCapability: "reservation-2" }),
    /not found/i,
  );
  assert.throws(() => authorizePaymentStatus(null, {
    guestCheckoutCapability: "reservation-1",
  }), /not found/i);
});
