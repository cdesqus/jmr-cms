import assert from "node:assert/strict";
import test from "node:test";
import {
  membershipCheckoutMode,
  membershipSurfaceEnabled,
  visibleAdminNavigation,
} from "./membership-surface-policy.cjs";
import { isMembershipEnabled } from "./membership-admin-policy.cjs";
import { membershipCustomerBoundary } from "./membership-customer-policy.cjs";

test("feature-off hides membership/payment pages and owner navigation", () => {
  assert.equal(isMembershipEnabled({}), false);
  assert.deepEqual(membershipCustomerBoundary({}, { documentId: "customer-1" }), {
    status: 404,
    error: "Not found.",
  });
  assert.equal(membershipSurfaceEnabled({}), false);
  assert.equal(membershipSurfaceEnabled({ MEMBERSHIP_ENABLED: "TRUE" }), false);
  assert.equal(membershipSurfaceEnabled({ MEMBERSHIP_ENABLED: "true" }), true);

  const groups = [{
    label: "Storefront",
    items: [
      { href: "/admin/membership", roles: ["owner"], membershipOnly: true },
      { href: "/admin/payments", roles: ["owner"], paymentsOnly: true },
      { href: "/admin/content", roles: ["owner", "content"] },
    ],
  }];
  assert.deepEqual(
    visibleAdminNavigation(groups, "owner", false, false)[0].items.map((item) => item.href),
    ["/admin/content"],
  );
  assert.deepEqual(
    visibleAdminNavigation(groups, "owner", true, true)[0].items.map((item) => item.href),
    ["/admin/membership", "/admin/payments", "/admin/content"],
  );
  assert.deepEqual(
    visibleAdminNavigation(groups, "owner", true, false)[0].items.map((item) => item.href),
    ["/admin/membership", "/admin/content"],
  );
});

test("membership feature-off leaves ordinary guest and one-time checkout branches unchanged", () => {
  for (const env of [{}, { MEMBERSHIP_ENABLED: "FALSE" }, { MEMBERSHIP_ENABLED: "true" }]) {
    assert.equal(membershipCheckoutMode({}, env), "ordinary");
    assert.equal(membershipCheckoutMode({ membershipCheckout: null }, env), "ordinary");
  }
  assert.equal(
    membershipCheckoutMode({ membershipCheckout: { membershipDocumentId: "m1" } }, {}),
    "membership-disabled",
  );
  assert.equal(
    membershipCheckoutMode(
      { membershipCheckout: { membershipDocumentId: "m1" } },
      { MEMBERSHIP_ENABLED: "true" },
    ),
    "membership",
  );
});
