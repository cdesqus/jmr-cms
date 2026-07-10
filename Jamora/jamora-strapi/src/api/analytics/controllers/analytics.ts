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
    const costRatio = Number(process.env.JAMORA_COST_RATIO ?? DEFAULT_COST_RATIO);
    const estimatedProfitCents = Math.max(
      0,
      Math.round(totalCents * (1 - (Number.isFinite(costRatio) ? costRatio : DEFAULT_COST_RATIO))),
    );

    const order = await strapi.documents("api::order.order").create({
      data: {
        orderNumber: asString(body.orderNumber),
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
};
