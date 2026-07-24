export default {
  routes: [
    { method: "GET", path: "/jamora/membership/plans", handler: "membership-operations.plans", config: { auth: false } },
    { method: "GET", path: "/jamora/membership/me", handler: "membership-operations.me", config: { auth: false } },
    { method: "POST", path: "/jamora/membership/purchase", handler: "membership-operations.purchase", config: { auth: false } },
    { method: "POST", path: "/jamora/membership/reserve", handler: "membership-operations.reserve", config: { auth: false } },
    { method: "POST", path: "/jamora/membership/release", handler: "membership-operations.release", config: { auth: false } },
    { method: "POST", path: "/jamora/membership/redeem", handler: "membership-operations.redeem", config: { auth: false } },
    { method: "POST", path: "/jamora/membership/renew", handler: "membership-operations.renew", config: { auth: false } },
    { method: "GET", path: "/jamora/admin/membership/plans", handler: "membership-operations.adminPlans", config: { auth: false } },
    { method: "POST", path: "/jamora/admin/membership/plans", handler: "membership-operations.createPlan", config: { auth: false } },
    { method: "PATCH", path: "/jamora/admin/membership/plans/:documentId", handler: "membership-operations.updatePlan", config: { auth: false } },
    { method: "GET", path: "/jamora/admin/memberships", handler: "membership-operations.memberships", config: { auth: false } },
    { method: "POST", path: "/jamora/admin/memberships/:documentId/adjust", handler: "membership-operations.adjust", config: { auth: false } },
    { method: "POST", path: "/jamora/admin/memberships/expire-due", handler: "membership-operations.expireDue", config: { auth: false } },
  ],
};
