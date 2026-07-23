export default {
  routes: [
    { method: "POST", path: "/jamora/customer/register", handler: "customer-auth.register", config: { auth: false } },
    { method: "POST", path: "/jamora/customer/verify-email", handler: "customer-auth.verifyEmail", config: { auth: false } },
    { method: "POST", path: "/jamora/customer/login", handler: "customer-auth.login", config: { auth: false } },
    { method: "POST", path: "/jamora/customer/forgot-password", handler: "customer-auth.forgotPassword", config: { auth: false } },
    { method: "POST", path: "/jamora/customer/reset-password", handler: "customer-auth.resetPassword", config: { auth: false } },
    { method: "POST", path: "/jamora/customer/session", handler: "customer-auth.session", config: { auth: false } },
  ],
};
