import { products } from "./seed/products";

export default {
  async bootstrap({ strapi }) {
    await seedProducts(strapi);
    await enablePublicProductRead(strapi);
  },
};

async function seedProducts(strapi: any) {
  const existing = await strapi.documents("api::product.product").findMany({
    fields: ["slug"],
    limit: 1,
  });

  if (existing.length > 0) return;

  for (const product of products) {
    await strapi.documents("api::product.product").create({
      data: {
        ...product,
        publishedAt: new Date(),
      },
    });
  }

  strapi.log.info(`Seeded ${products.length} Jamora products`);
}

async function enablePublicProductRead(strapi: any) {
  const pluginStore = strapi.store({
    type: "plugin",
    name: "users-permissions",
  });
  const grant = await pluginStore.get({ key: "grant" });
  if (!grant?.public) return;

  grant.public.permissions ||= {};
  grant.public.permissions.product ||= {};
  grant.public.permissions.product.controllers ||= {};
  grant.public.permissions.product.controllers.product ||= {};
  grant.public.permissions.product.controllers.product.find = { enabled: true };
  grant.public.permissions.product.controllers.product.findOne = { enabled: true };

  await pluginStore.set({ key: "grant", value: grant });
}
