export default {
  routes: [
    {
      method: "GET",
      path: "/jamora/admin/affiliates",
      handler: "affiliate-operations.adminList",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/affiliates",
      handler: "affiliate-operations.adminCreate",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/affiliates/click",
      handler: "affiliate-operations.publicClick",
      config: { auth: false },
    },
  ],
};
