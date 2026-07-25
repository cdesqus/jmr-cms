export default [
  "strapi::logger",
  "strapi::errors",
  "strapi::security",
  "strapi::cors",
  "strapi::poweredBy",
  {
    name: "global::ropay-request-guard",
    config: {
      maxBytes: 4096,
      limit: process.env.ROPAY_RATE_LIMIT,
      windowMs: process.env.ROPAY_RATE_WINDOW_MS,
      maxBuckets: process.env.ROPAY_RATE_MAX_BUCKETS,
    },
  },
  {
    name: "global::shipping-webhook-guard",
    config: {
      maxBytes: 4096,
      limit: process.env.SHIPPING_WEBHOOK_IP_RATE_LIMIT,
      windowMs: process.env.SHIPPING_WEBHOOK_RATE_WINDOW_MS,
      maxBuckets: process.env.SHIPPING_WEBHOOK_RATE_MAX_BUCKETS,
    },
  },
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
