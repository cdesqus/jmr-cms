import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";

// Jamora catalogue — mirrors jamora-web/src/lib/products.ts. Display-only
// attributes the storefront needs (botanical name, label gradient, benefits,
// etc.) are stored in each product's `metadata` so merchandisers can edit them
// in the Admin dashboard.
const JAMORA_PRODUCTS = [
  {
    slug: "temulawak-vitality",
    title: "Temulawak Vitality",
    botanical: "Curcuma zanthorrhiza",
    category: "energy",
    price: 32,
    tagline: "Java's golden root, standardised for steady energy.",
    description:
      "A single-origin Javanese temulawak tonic, cold-milled to preserve its curcuminoids. Where coffee spikes and crashes, Temulawak offers a slow, sustained lift — the way Indonesian herbalists have used it for centuries.",
    ingredients: [
      "Javanese temulawak (Curcuma zanthorrhiza) 92%",
      "Black pepper extract (piperine)",
      "Acacia fibre",
    ],
    allergens: [],
    benefits: ["Sustained daytime energy", "Liver & metabolic support", "Antioxidant curcuminoids"],
    howToUse: "Whisk one 3 g sachet into 150 ml of warm water each morning, before food.",
    certifications: ["Organic", "Vegan", "EU Compliant", "GMP"],
    netWeight: "30 sachets · 90 g",
    gradient: ["#e2913f", "#c25a2b"],
  },
  {
    slug: "red-ginger-ember",
    title: "Red Ginger Ember",
    botanical: "Zingiber officinale var. rubrum",
    category: "energy",
    price: 28,
    tagline: "Jahe merah — warmth that moves.",
    description:
      "Highland red ginger, hotter and more resinous than its common cousin, blended into a brisk morning infusion. A circulatory wake-up that warms from the inside out.",
    ingredients: [
      "Red ginger (Zingiber officinale var. rubrum) 88%",
      "Java cinnamon",
      "Palm sugar (low-GI)",
    ],
    allergens: [],
    benefits: ["Stimulates circulation", "Pre-movement warm-up", "Immune resilience"],
    howToUse: "Steep one sachet in 200 ml just-boiled water for 4 minutes. Enjoy morning or pre-exercise.",
    certifications: ["Organic", "Vegan", "EU Compliant", "Non-GMO"],
    netWeight: "24 sachets · 96 g",
    gradient: ["#d5722e", "#9f461f"],
  },
  {
    slug: "kencur-calm",
    title: "Kencur Calm",
    botanical: "Kaempferia galanga",
    category: "digestion",
    price: 30,
    tagline: "Aromatic ginger to settle the centre.",
    description:
      "Kencur — Indonesia's aromatic sand ginger — is the quiet backbone of jamu. This blend eases bloating and calms an unsettled stomach with a clean, camphor-bright finish.",
    ingredients: [
      "Kencur / sand ginger (Kaempferia galanga) 85%",
      "Fennel seed",
      "Tamarind",
    ],
    allergens: [],
    benefits: ["Eases bloating", "Post-meal digestive comfort", "Soothes nausea"],
    howToUse: "Dissolve one sachet in 150 ml warm water after meals, up to twice daily.",
    certifications: ["Organic", "Vegan", "EU Compliant", "GMP"],
    netWeight: "30 sachets · 90 g",
    gradient: ["#8aa06f", "#5b6f57"],
  },
  {
    slug: "beras-kencur-heritage",
    title: "Beras Kencur Heritage",
    botanical: "Oryza · Kaempferia",
    category: "digestion",
    price: 26,
    tagline: "The classic rice-and-kencur restorative.",
    description:
      "Our faithful take on beras kencur, the toasted-rice tonic Javanese mothers have poured for generations. Nourishing, mellow, and gently sweet.",
    ingredients: [
      "Toasted rice (Oryza sativa)",
      "Kencur (Kaempferia galanga)",
      "Palm sugar (low-GI)",
      "Java cinnamon",
    ],
    allergens: [],
    benefits: ["Gentle digestive tonic", "Restorative & nourishing", "Naturally caffeine-free"],
    howToUse: "Stir one sachet into 180 ml warm water or plant milk, any time of day.",
    certifications: ["Vegan", "EU Compliant", "Non-GMO"],
    netWeight: "20 sachets · 80 g",
    gradient: ["#b9a06f", "#6f8a5a"],
  },
  {
    slug: "secang-rosewood-harmony",
    title: "Secang Rosewood Harmony",
    botanical: "Caesalpinia sappan",
    category: "balance",
    price: 34,
    tagline: "The rose-red infusion of equilibrium.",
    description:
      "Sappanwood steeps into a luminous rose-red cup with a soft, woody sweetness. Long prized in Javanese wedang for warmth and balance, it is our most contemplative blend.",
    ingredients: [
      "Secang / sappanwood (Caesalpinia sappan) 80%",
      "Clove",
      "Java cinnamon",
      "Cardamom",
    ],
    allergens: [],
    benefits: ["Calming & centring", "Antioxidant-rich", "Evening wind-down ritual"],
    howToUse: "Steep one sachet in 220 ml just-boiled water for 5 minutes. Ideal in the evening.",
    certifications: ["Organic", "Vegan", "EU Compliant", "GMP", "Non-GMO"],
    netWeight: "24 sachets · 96 g",
    gradient: ["#b06d7a", "#9179ac"],
  },
  {
    slug: "kayu-manis-equilibrium",
    title: "Kayu Manis Equilibrium",
    botanical: "Cinnamomum burmannii",
    category: "balance",
    price: 29,
    tagline: "Sumatran cinnamon for steady balance.",
    description:
      "True Sumatran kayu manis, warm and honeyed, blended to support balanced blood sugar and a settled, even mood through the day.",
    ingredients: [
      "Sumatran cinnamon (Cinnamomum burmannii) 90%",
      "Ginger",
      "Cardamom",
    ],
    allergens: [],
    benefits: ["Supports balanced blood sugar", "Warming & grounding", "Naturally caffeine-free"],
    howToUse: "Whisk one sachet into 150 ml warm water or milk, morning or evening.",
    certifications: ["Organic", "Vegan", "EU Compliant"],
    netWeight: "30 sachets · 90 g",
    gradient: ["#a98a63", "#9179ac"],
  },
];

const CATEGORY_NAMES: Record<string, string> = {
  energy: "Energy",
  digestion: "Digestion",
  balance: "Balance",
};

export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  );

  // EU markets Jamora ships to.
  const countries = ["ro", "de", "nl", "fr", "be", "at", "es", "it", "gb"];

  logger.info("Seeding store data...");
  const {
    result: [defaultSalesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        { name: "Jamora Storefront", description: "Jamora EU storefront" },
      ],
    },
  });

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Jamora Storefront Key",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [defaultSalesChannel.id] },
  });

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "Jamora",
          supported_currencies: [{ currency_code: "eur", is_default: true }],
          default_sales_channel_id: defaultSalesChannel.id,
        },
      ],
    },
  });

  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Europe",
          currency_code: "eur",
          countries,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regionResult[0];

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Jamora Fulfilment — Romania",
          address: { city: "Bucharest", country_code: "RO", address_1: "" },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });

  logger.info("Seeding fulfillment data...");
  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfileResult[0];

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "European delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Europe",
        geo_zones: countries.map((country_code) => ({
          country_code,
          type: "country" as const,
        })),
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Ship in 2-3 days.",
          code: "standard",
        },
        prices: [
          { currency_code: "eur", amount: 4.95 },
          { region_id: region.id, amount: 4.95 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        name: "Free EU Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Free",
          description: "Free over €50.",
          code: "free",
        },
        prices: [
          { currency_code: "eur", amount: 0 },
          { region_id: region.id, amount: 0 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [defaultSalesChannel.id] },
  });
  logger.info("Finished seeding fulfillment data.");

  logger.info("Seeding product categories...");
  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: Object.entries(CATEGORY_NAMES).map(([slug, name]) => ({
        name,
        handle: slug,
        is_active: true,
      })),
    },
  });
  const categoryIdByName = new Map(categoryResult.map((c) => [c.name, c.id]));

  logger.info("Seeding Jamora products...");
  await createProductsWorkflow(container).run({
    input: {
      products: JAMORA_PRODUCTS.map((p) => ({
        title: p.title,
        handle: p.slug,
        description: p.description,
        status: ProductStatus.PUBLISHED,
        category_ids: [categoryIdByName.get(CATEGORY_NAMES[p.category])!],
        shipping_profile_id: shippingProfile.id,
        weight: 120,
        options: [{ title: "Format", values: ["Sachet box"] }],
        metadata: {
          botanical: p.botanical,
          tagline: p.tagline,
          category: p.category,
          gradient_from: p.gradient[0],
          gradient_to: p.gradient[1],
          net_weight: p.netWeight,
          benefits: p.benefits.join("\n"),
          ingredients: p.ingredients.join("\n"),
          allergens: p.allergens.join(", "),
          how_to_use: p.howToUse,
          certifications: p.certifications.join(", "),
        },
        variants: [
          {
            title: p.netWeight,
            sku: p.slug.toUpperCase().replace(/-/g, "_"),
            options: { Format: "Sachet box" },
            prices: [{ amount: p.price, currency_code: "eur" }],
          },
        ],
        sales_channels: [{ id: defaultSalesChannel.id }],
      })),
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels...");
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });
  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryItems.map((item) => ({
        location_id: stockLocation.id,
        stocked_quantity: 100000,
        inventory_item_id: item.id,
      })),
    },
  });
  logger.info("Finished seeding inventory levels.");

  logger.info(
    `\n==================\nPUBLISHABLE_KEY=${publishableApiKey.token}\n==================\n` +
      "Add this to jamora-web/.env.local as NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY"
  );
}
