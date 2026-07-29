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
    {
      method: "POST",
      path: "/jamora/shipping/quotes",
      handler: "shipping-operations.quoteShipping",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/shipping/select",
      handler: "shipping-operations.selectShippingQuote",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/shipping/tracking/webhook",
      handler: "shipping-operations.trackingWebhook",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/shipping/tracking/capabilities/claim",
      handler: "shipping-operations.claimTrackingCapability",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/shipping/tracking/poll",
      handler: "shipping-operations.pollTracking",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/shipping/tracking/capabilities/reissue",
      handler: "shipping-operations.reissueTrackingCapabilities",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/shipping/tracking/capabilities/manage",
      handler: "shipping-operations.manageTrackingCapabilities",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/shipping/shipments/:orderDocumentId",
      handler: "shipping-operations.createShipment",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/shipping/shipments/:shipmentDocumentId/labels/capability",
      handler: "shipping-operations.createLabelCapability",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/admin/shipping/shipments/:shipmentDocumentId/labels",
      handler: "shipping-operations.downloadLabel",
      config: { auth: false },
    },
  ],
};
