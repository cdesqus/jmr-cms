export default {
  routes: [
    {
      method: "POST",
      path: "/jamora/address/suggest",
      handler: "shipping-operations.suggestAddress",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/address/assess",
      handler: "shipping-operations.assessAddress",
      config: { auth: false },
    },
  ],
};
