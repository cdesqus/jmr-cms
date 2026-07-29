import assert from "node:assert/strict";
import test from "node:test";

import consentRoutes from "./customer-consent.cjs";
import commerceRoutes from "../../commerce-event/routes/commerce-event.cjs";
import refundRoutes from "../../payment-refund/routes/payment-refund.cjs";

test("sensitive ledgers expose no generated public CRUD", () => {
  for (const routes of [consentRoutes, commerceRoutes, refundRoutes]) {
    assert.equal(routes.routes.some(({ method }) => ["PUT", "DELETE"].includes(method)), false);
  }
  assert.deepEqual(consentRoutes.routes.map(({ method, path }) => ({ method, path })), [
    { method: "POST", path: "/jamora/internal/consent-decisions" },
  ]);
});
