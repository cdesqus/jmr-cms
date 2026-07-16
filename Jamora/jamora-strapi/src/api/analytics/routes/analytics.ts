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
      method: "POST",
      path: "/jamora/inventory/reserve",
      handler: "analytics.reserveStock",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/promotions/validate",
      handler: "analytics.validatePromotion",
      config: { auth: false },
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
      method: "GET",
      path: "/jamora/admin/customers",
      handler: "analytics.adminCustomers",
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
      method: "GET",
      path: "/jamora/admin/inventory-movements",
      handler: "analytics.adminInventoryMovements",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/admin/inventory-batches",
      handler: "analytics.adminInventoryBatches",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/inventory-batches",
      handler: "analytics.adminCreateInventoryBatch",
      config: { auth: false },
    },
    {
      method: "PATCH",
      path: "/jamora/admin/inventory-batches/:documentId",
      handler: "analytics.adminUpdateInventoryBatch",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/admin/returns",
      handler: "analytics.adminReturns",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/returns",
      handler: "analytics.adminCreateReturn",
      config: { auth: false },
    },
    {
      method: "PATCH",
      path: "/jamora/admin/returns/:documentId",
      handler: "analytics.adminUpdateReturn",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/admin/notifications",
      handler: "analytics.adminNotifications",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/admin/promotions",
      handler: "analytics.adminPromotions",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/promotions",
      handler: "analytics.adminCreatePromotion",
      config: { auth: false },
    },
    {
      method: "PATCH",
      path: "/jamora/admin/promotions/:documentId",
      handler: "analytics.adminUpdatePromotion",
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
