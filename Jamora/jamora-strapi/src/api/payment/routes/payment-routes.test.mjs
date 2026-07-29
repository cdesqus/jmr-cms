import assert from "node:assert/strict";
import test from "node:test";

import routes from "./payment-routes.cjs";
import service from "../services/payment-service.cjs";

test("payment content type exposes no generated CRUD routes", () => {
  assert.deepEqual(routes, { routes: [] });
});

test("payment core service rejects every direct CRUD operation", async () => {
  for (const method of ["find", "findOne", "create", "update", "delete"]) {
    assert.throws(() => service[method](), /not found/i);
  }
});
