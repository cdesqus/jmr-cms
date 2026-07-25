export default ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  app: {
    keys: env.array("APP_KEYS"),
  },
  url: env("PUBLIC_URL", "http://localhost:9014"),
  // Trust X-Forwarded-For only when Strapi is reachable solely through a
  // controlled reverse proxy. Any other value preserves Koa's direct-peer IP.
  proxy: env("TRUST_PROXY", "false") === "true",
});
