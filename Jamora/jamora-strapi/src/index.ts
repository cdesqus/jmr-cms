import { products } from "./seed/products";

export default {
  async bootstrap({ strapi }) {
    await seedProducts(strapi);
    await seedStoreContent(strapi);
    await backfillProductStockThresholds(strapi);
    await backfillProductSkus(strapi);
    await enablePublicProductRead(strapi);
    await configureOrderListView(strapi);
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

async function backfillProductSkus(strapi: any) {
  const existing = await strapi.documents("api::product.product").findMany({
    fields: ["documentId", "slug", "sku"],
    limit: 1000,
  });

  for (const product of existing) {
    if (product.sku) continue;
    const sku = `JM-${String(product.slug ?? product.documentId)
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 12)
      .toUpperCase()}`;
    await strapi.documents("api::product.product").update({
      documentId: product.documentId,
      data: { sku } as any,
      status: "published",
    } as any);
  }
}

async function seedStoreContent(strapi: any) {
  const existing = await strapi.documents("api::store-content.store-content").findFirst({
    fields: ["documentId"],
  });

  if (existing) return;

  await strapi.documents("api::store-content.store-content").create({
    data: {
      heroEyebrow: "Energi · Digestie · Echlibru",
      heroTitle: "100% Made in Indonesia,",
      heroHighlight: "standardised for Europe.",
      heroDescription:
        "Premium jamu - Indonesia's living herbal tradition - refined to European standards of purity, transparency, and taste.",
      primaryCtaLabel: "Explore the collection",
      secondaryCtaLabel: "Our story",
      heroEyebrowRo: "Energie · Digestie · Echilibru",
      heroTitleRo: "100% produs in Indonezia,",
      heroHighlightRo: "standardizat pentru Europa.",
      heroDescriptionRo:
        "Jamu premium - traditia vie a plantelor indoneziene - rafinat pentru standarde europene de puritate, transparenta si gust.",
      primaryCtaLabelRo: "Exploreaza colectia",
      secondaryCtaLabelRo: "Povestea noastra",
      pillarsEyebrow: "Three pillars",
      pillarsTitle: "One tradition, three ways to feel well.",
      featuredEyebrow: "Best sellers",
      featuredTitle: "Loved across Europe",
      storyEyebrow: "From root to cup",
      storyTitle: "Traceable botanicals, standardised potency.",
      storyDescription:
        "Every batch is single-origin, lab-verified for active compounds, and documented from the Javanese highlands to your kitchen.",
      pillarsEyebrowRo: "Trei directii",
      pillarsTitleRo: "O traditie, trei moduri de a te simti bine.",
      featuredEyebrowRo: "Cele mai iubite",
      featuredTitleRo: "Apreciate in Europa",
      storyEyebrowRo: "De la radacina la ceasca",
      storyTitleRo: "Plante trasabile, putere standardizata.",
      storyDescriptionRo:
        "Fiecare lot are origine unica, este verificat in laborator pentru compusi activi si documentat din zonele inalte ale Javei pana in bucataria ta.",
      certifications: ["Organic", "Vegan", "EU Compliant", "GMP", "Non-GMO"],
      publishedAt: new Date(),
    },
  });
}

async function backfillProductStockThresholds(strapi: any) {
  const existing = await strapi.documents("api::product.product").findMany({
    fields: ["documentId", "minStock", "maxStock"],
    limit: 1000,
  });

  for (const product of existing) {
    if (typeof product.minStock === "number" && typeof product.maxStock === "number") continue;

    await strapi.documents("api::product.product").update({
      documentId: product.documentId,
      data: {
        minStock: typeof product.minStock === "number" ? product.minStock : 10,
        maxStock: typeof product.maxStock === "number" ? product.maxStock : 100,
      } as any,
      status: "published",
    } as any);
  }
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

async function configureOrderListView(strapi: any) {
  try {
    const store = strapi.store({
      type: "plugin",
      name: "content-manager",
    });
    const key = "configuration_content_types::api::order.order";
    const existing = (await store.get({ key })) ?? {};

    await store.set({
      key,
      value: {
        ...existing,
        settings: {
          ...existing.settings,
          mainField: "orderNumber",
          defaultSortBy: "createdAt",
          defaultSortOrder: "DESC",
        },
        layouts: {
          ...existing.layouts,
          list: [
            "orderNumber",
            "email",
            "status",
            "totalCents",
            "trackingNumber",
            "createdAt",
          ],
          edit: [
            [
              { name: "orderNumber", size: 6 },
              { name: "status", size: 6 },
            ],
            [
              { name: "trackingPreviewUrl", size: 6 },
              { name: "deliveryLabelUrl", size: 6 },
            ],
            [
              { name: "trackingNumber", size: 6 },
              { name: "carrier", size: 6 },
            ],
            [
              { name: "customerName", size: 6 },
              { name: "email", size: 6 },
            ],
            [
              { name: "shippingAddressText", size: 12 },
            ],
            [
              { name: "totalCents", size: 4 },
              { name: "estimatedProfitCents", size: 4 },
              { name: "estimatedDelivery", size: 4 },
            ],
            [
              { name: "itemsSummary", size: 12 },
            ],
          ],
        },
        metadatas: {
          ...existing.metadatas,
          orderNumber: {
            ...(existing.metadatas?.orderNumber ?? {}),
            list: {
              ...(existing.metadatas?.orderNumber?.list ?? {}),
              label: "No Order",
              searchable: true,
              sortable: true,
            },
            edit: {
              ...(existing.metadatas?.orderNumber?.edit ?? {}),
              label: "No Order",
              description: "Customer-facing order number.",
            },
          },
          trackingPreviewUrl: fieldMeta(existing, "trackingPreviewUrl", "Tracking Preview URL", true),
          deliveryLabelUrl: fieldMeta(existing, "deliveryLabelUrl", "Delivery Label URL", true),
          trackingNumber: fieldMeta(existing, "trackingNumber", "Tracking Number", false),
          itemsSummary: fieldMeta(existing, "itemsSummary", "Items Summary", true),
          shippingAddressText: fieldMeta(existing, "shippingAddressText", "Shipping Address", true),
          totalCents: fieldMeta(existing, "totalCents", "Total Cents", true),
          estimatedProfitCents: fieldMeta(existing, "estimatedProfitCents", "Estimated Profit Cents", true),
          stripeSessionId: fieldMeta(existing, "stripeSessionId", "Stripe Session ID", true),
        },
      },
    });
  } catch (error) {
    strapi.log.warn("Could not apply Jamora order list view configuration");
  }
}

function fieldMeta(existing: any, name: string, label: string, readonly: boolean) {
  return {
    ...(existing.metadatas?.[name] ?? {}),
    list: {
      ...(existing.metadatas?.[name]?.list ?? {}),
      label,
    },
    edit: {
      ...(existing.metadatas?.[name]?.edit ?? {}),
      label,
      description: readonly ? "Generated automatically by Jamora." : undefined,
      editable: !readonly,
      disabled: readonly,
    },
  };
}
