const DEFAULT_COST_RATIO = 0.42;

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function requireAdminSecret(ctx: any) {
  const secret = process.env.JAMORA_ADMIN_API_SECRET;
  if (!secret) return true;
  if (ctx.get("x-jamora-admin-secret") === secret) return true;

  ctx.status = 401;
  ctx.body = { error: "Admin API secret required." };
  return false;
}

function asOrderStatus(value: unknown) {
  const status = asString(value).toLowerCase();
  return [
    "pending",
    "paid",
    "processing",
    "shipped",
    "fulfilled",
    "failed",
    "refunded",
  ].includes(status)
    ? status
    : undefined;
}

function parseListText(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return asString(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function contentData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of [
    "heroEyebrow",
    "heroTitle",
    "heroHighlight",
    "heroDescription",
    "primaryCtaLabel",
    "secondaryCtaLabel",
    "pillarsEyebrow",
    "pillarsTitle",
    "featuredEyebrow",
    "featuredTitle",
    "storyEyebrow",
    "storyTitle",
    "storyDescription",
  ]) {
    if (typeof body[field] === "string") data[field] = body[field].trim();
  }
  if ("certifications" in body) data.certifications = parseListText(body.certifications);
  return data;
}

function productData(body: Record<string, unknown>, mode: "create" | "update") {
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.slug === "string") data.slug = body.slug.trim();
  if (typeof body.botanical === "string") data.botanical = body.botanical.trim();
  if (["energy", "digestion", "balance"].includes(asString(body.category))) data.category = body.category;
  if (typeof body.priceCents === "number") data.priceCents = Math.max(0, Math.round(body.priceCents));
  if (typeof body.stock === "number") data.stock = Math.max(0, Math.round(body.stock));
  if (typeof body.minStock === "number") data.minStock = Math.max(0, Math.round(body.minStock));
  if (typeof body.maxStock === "number") data.maxStock = Math.max(0, Math.round(body.maxStock));
  if (typeof body.featured === "boolean") data.featured = asBoolean(body.featured);
  if (typeof body.tagline === "string") data.tagline = body.tagline.trim();
  if (typeof body.description === "string") data.description = body.description.trim();
  if (typeof body.howToUse === "string") data.howToUse = body.howToUse.trim();
  if (typeof body.netWeight === "string") data.netWeight = body.netWeight.trim();
  if ("ingredients" in body) data.ingredients = parseListText(body.ingredients);
  if ("allergens" in body) data.allergens = parseListText(body.allergens);
  if ("benefits" in body) data.benefits = parseListText(body.benefits);
  if ("certifications" in body) data.certifications = parseListText(body.certifications);
  if ("gradient" in body) data.gradient = parseListText(body.gradient);
  if (typeof body.imageId === "number") data.image = body.imageId;

  if (mode === "create") {
    data.name ||= "New Jamora Product";
    data.slug ||= asString(data.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    data.category ||= "energy";
    data.priceCents ||= 0;
    data.netWeight ||= "30 sachets · 90 g";
    data.stock ||= 0;
    data.minStock ||= 10;
    data.maxStock ||= 100;
    data.gradient ||= ["#e2913f", "#c25a2b"];
  }

  return data;
}

function centsToEur(cents: number) {
  return Math.round(cents) / 100;
}

async function decrementProductStock(items: any[]) {
  for (const item of items) {
    const slug = asString(item.slug);
    const qty = Math.max(0, asNumber(item.qty));
    if (!slug || qty <= 0) continue;

    const products = await strapi.documents("api::product.product").findMany({
      fields: ["documentId", "slug", "stock"],
      filters: { slug: { $eq: slug } },
      limit: 1,
    });
    const product = products[0] as any;
    if (!product?.documentId || typeof product.stock !== "number") continue;

    await strapi.documents("api::product.product").update({
      documentId: product.documentId,
      data: {
        stock: Math.max(0, product.stock - qty),
      } as any,
    });
  }
}

export default {
  async visit(ctx) {
    const body = ctx.request.body ?? {};
    const path = asString(body.path, "/").slice(0, 500);

    await strapi.documents("api::visit-event.visit-event").create({
      data: {
        visitorId: asString(body.visitorId).slice(0, 120),
        path,
        referrer: asString(body.referrer).slice(0, 1000),
        userAgent: asString(body.userAgent).slice(0, 1000),
        source: "storefront",
      },
    });

    ctx.body = { ok: true };
  },

  async mockPaidOrder(ctx) {
    const body = ctx.request.body ?? {};
    const items = Array.isArray(body.items) ? body.items : [];
    const totalCents = asNumber(body.totalCents);
    const orderNumber = asString(body.orderNumber);
    const storefrontUrl = (
      process.env.JAMORA_STOREFRONT_URL ??
      process.env.PUBLIC_URL ??
      "http://localhost:3095"
    ).replace(/\/$/, "");
    const costRatio = Number(process.env.JAMORA_COST_RATIO ?? DEFAULT_COST_RATIO);
    const estimatedProfitCents = Math.max(
      0,
      Math.round(totalCents * (1 - (Number.isFinite(costRatio) ? costRatio : DEFAULT_COST_RATIO))),
    );

    const order = await strapi.documents("api::order.order").create({
      data: {
        orderNumber,
        trackingNumber: asString(body.trackingNumber),
        carrier: asString(body.carrier, "Jamora EU Fulfilment"),
        customerName: asString(body.customer?.name),
        email: asString(body.customer?.email, "customer@example.com"),
        status: "paid",
        currency: "eur",
        totalCents,
        estimatedProfitCents,
        stripeSessionId: asString(body.stripeSessionId, "mock-paid-checkout"),
        itemsSummary: JSON.stringify(items, null, 2),
        shippingAddressText: asString(
          body.customer?.address,
          asString(body.shippingAddress?.address),
        ),
        trackingPreviewUrl: `${storefrontUrl}/track?order=${encodeURIComponent(orderNumber)}`,
        deliveryLabelUrl: `${storefrontUrl}/delivery-label/${encodeURIComponent(orderNumber)}`,
        estimatedDelivery: body.estimatedDelivery,
      },
    });

    await decrementProductStock(items);

    ctx.body = { ok: true, order };
  },

  async trackOrder(ctx) {
    const query = asString(ctx.query.q).trim();
    if (!query) {
      ctx.status = 400;
      ctx.body = { error: "Missing tracking query." };
      return;
    }

    const orders = await strapi.documents("api::order.order").findMany({
      fields: [
        "documentId",
        "orderNumber",
        "trackingNumber",
        "carrier",
        "customerName",
        "email",
        "status",
        "currency",
        "totalCents",
        "itemsSummary",
        "shippingAddressText",
        "trackingPreviewUrl",
        "deliveryLabelUrl",
        "estimatedDelivery",
        "createdAt",
      ],
      filters: {
        $or: [
          { orderNumber: { $eqi: query } },
          { trackingNumber: { $eqi: query } },
        ],
      },
      limit: 1,
    });

    const order = orders[0];
    if (!order) {
      ctx.status = 404;
      ctx.body = { error: "Order not found." };
      return;
    }

    ctx.body = { order };
  },

  async summary(ctx) {
    const today = startOfDay();
    const costRatio = Number(process.env.JAMORA_COST_RATIO ?? DEFAULT_COST_RATIO);
    const safeCostRatio = Number.isFinite(costRatio) ? costRatio : DEFAULT_COST_RATIO;

    const [visits, visitsToday, paidOrders] = await Promise.all([
      strapi.documents("api::visit-event.visit-event").findMany({
        fields: ["documentId"],
        limit: 10000,
      }),
      strapi.documents("api::visit-event.visit-event").findMany({
        fields: ["documentId"],
        filters: { createdAt: { $gte: today } },
        limit: 10000,
      }),
      strapi.documents("api::order.order").findMany({
        fields: ["totalCents", "estimatedProfitCents", "createdAt"],
        filters: { status: { $in: ["paid", "fulfilled"] } },
        sort: { createdAt: "desc" },
        limit: 10000,
      }),
    ]);

    const revenueCents = paidOrders.reduce(
      (sum, order: any) => sum + asNumber(order.totalCents),
      0,
    );
    const profitCents = paidOrders.reduce((sum, order: any) => {
      const stored = asNumber(order.estimatedProfitCents, -1);
      return sum + (stored >= 0 ? stored : Math.round(asNumber(order.totalCents) * (1 - safeCostRatio)));
    }, 0);
    const todayRevenueCents = paidOrders
      .filter((order: any) => new Date(order.createdAt).toISOString() >= today)
      .reduce((sum, order: any) => sum + asNumber(order.totalCents), 0);

    ctx.body = {
      visits: visits.length,
      visitsToday: visitsToday.length,
      sales: paidOrders.length,
      revenueCents,
      revenueEur: centsToEur(revenueCents),
      todayRevenueCents,
      todayRevenueEur: centsToEur(todayRevenueCents),
      estimatedProfitCents: profitCents,
      estimatedProfitEur: centsToEur(profitCents),
      estimatedMargin: revenueCents > 0 ? Math.round((profitCents / revenueCents) * 1000) / 10 : 0,
      costRatio: safeCostRatio,
    };
  },

  async adminOrders(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const orders = await strapi.documents("api::order.order").findMany({
      fields: [
        "documentId",
        "orderNumber",
        "trackingNumber",
        "carrier",
        "customerName",
        "email",
        "status",
        "currency",
        "totalCents",
        "estimatedProfitCents",
        "itemsSummary",
        "shippingAddressText",
        "trackingPreviewUrl",
        "deliveryLabelUrl",
        "estimatedDelivery",
        "createdAt",
      ],
      sort: { createdAt: "desc" },
      limit: 1000,
    });

    ctx.body = { orders };
  },

  async adminUpdateOrder(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const body = ctx.request.body ?? {};
    const data: Record<string, unknown> = {};
    const status = asOrderStatus(body.status);
    if (status) data.status = status;
    if (typeof body.trackingNumber === "string") data.trackingNumber = body.trackingNumber.trim();
    if (typeof body.carrier === "string") data.carrier = body.carrier.trim();
    if (typeof body.estimatedDelivery === "string") data.estimatedDelivery = body.estimatedDelivery;

    const order = await strapi.documents("api::order.order").update({
      documentId: ctx.params.documentId,
      data: data as any,
    });

    ctx.body = { ok: true, order };
  },

  async adminProducts(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const products = await strapi.documents("api::product.product").findMany({
      sort: { name: "asc" },
      limit: 1000,
    });

    ctx.body = { products };
  },

  async adminUpdateProduct(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const body = ctx.request.body ?? {};
    const data = productData(body, "update");

    const product = await strapi.documents("api::product.product").update({
      documentId: ctx.params.documentId,
      data: data as any,
      status: "published",
    } as any);

    ctx.body = { ok: true, product };
  },

  async adminCreateProduct(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const body = ctx.request.body ?? {};
    const product = await strapi.documents("api::product.product").create({
      data: {
        ...productData(body, "create"),
        publishedAt: new Date(),
      } as any,
      status: "published",
    } as any);

    ctx.body = { ok: true, product };
  },

  async adminUpload(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const files = ctx.request.files?.files;
    if (!files) {
      ctx.status = 400;
      ctx.body = { error: "Missing upload file." };
      return;
    }

    const uploaded = await strapi.plugin("upload").service("upload").upload({
      data: {},
      files,
    });

    ctx.body = { ok: true, files: uploaded };
  },

  async content(ctx) {
    const content = await strapi.documents("api::store-content.store-content").findFirst({
      fields: [
        "documentId",
        "heroEyebrow",
        "heroTitle",
        "heroHighlight",
        "heroDescription",
        "primaryCtaLabel",
        "secondaryCtaLabel",
        "pillarsEyebrow",
        "pillarsTitle",
        "featuredEyebrow",
        "featuredTitle",
        "storyEyebrow",
        "storyTitle",
        "storyDescription",
        "certifications",
        "updatedAt",
      ],
    });

    ctx.body = { content };
  },

  async adminUpdateContent(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const body = ctx.request.body ?? {};
    const existing = await strapi.documents("api::store-content.store-content").findFirst({
      fields: ["documentId"],
    });
    const data = contentData(body);
    const content = existing?.documentId
      ? await strapi.documents("api::store-content.store-content").update({
          documentId: existing.documentId,
          data,
          status: "published",
        } as any)
      : await strapi.documents("api::store-content.store-content").create({
          data: {
            ...data,
            publishedAt: new Date(),
          },
        } as any);

    ctx.body = { ok: true, content };
  },
};
