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
  ],
};
