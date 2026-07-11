export default {
  routes: [
    {
      method: "POST",
      path: "/jamora/analytics/visit",
      handler: "analytics.visit",
      config: {
        auth: false,
      },
    },
    {
      method: "POST",
      path: "/jamora/orders/mock-paid",
      handler: "analytics.mockPaidOrder",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/jamora/orders/track",
      handler: "analytics.trackOrder",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/jamora/analytics/summary",
      handler: "analytics.summary",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/jamora/content",
      handler: "analytics.content",
      config: { auth: false },
    },
    {
      method: "PATCH",
      path: "/jamora/admin/content",
      handler: "analytics.adminUpdateContent",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/admin/orders",
      handler: "analytics.adminOrders",
      config: { auth: false },
    },
    {
      method: "PATCH",
      path: "/jamora/admin/orders/:documentId",
      handler: "analytics.adminUpdateOrder",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/admin/products",
      handler: "analytics.adminProducts",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/products",
      handler: "analytics.adminCreateProduct",
      config: { auth: false },
    },
    {
      method: "PATCH",
      path: "/jamora/admin/products/:documentId",
      handler: "analytics.adminUpdateProduct",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/upload",
      handler: "analytics.adminUpload",
      config: { auth: false },
    },
  ],
};
