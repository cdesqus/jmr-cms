import test from "node:test";
import assert from "node:assert/strict";

import { browserSafeOperationBody } from "./customer-api-safety.cjs";

const customer = {
  documentId: "customer-1",
  name: "Customer",
  email: "customer@example.com",
  emailVerifiedAt: null,
  active: true,
  sessionVersion: 0,
};

test("never forwards account verification or password reset tokens", () => {
  assert.deepEqual(
    browserSafeOperationBody("register", {
      ...customer,
      verificationToken: "private-verification-token",
      passwordHash: "private-password-hash",
    }),
    customer,
  );
  assert.deepEqual(
    browserSafeOperationBody("forgot-password", {
      accepted: true,
      resetToken: "private-reset-token",
    }),
    { accepted: true },
  );
});
