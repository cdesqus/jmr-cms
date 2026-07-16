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
    "heroEyebrowRo",
    "heroTitleRo",
    "heroHighlightRo",
    "heroDescriptionRo",
    "primaryCtaLabelRo",
    "secondaryCtaLabelRo",
    "pillarsEyebrow",
    "pillarsTitle",
    "featuredEyebrow",
    "featuredTitle",
    "storyEyebrow",
    "storyTitle",
    "storyDescription",
    "pillarsEyebrowRo",
    "pillarsTitleRo",
    "featuredEyebrowRo",
    "featuredTitleRo",
    "storyEyebrowRo",
    "storyTitleRo",
    "storyDescriptionRo",
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
  if (typeof body.sku === "string") data.sku = body.sku.trim().toUpperCase();
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
    data.sku ||= `JM-${asString(data.slug).replace(/-/g, "").slice(0, 12).toUpperCase()}`;
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

function normalizeOrderItems(items: unknown[]) {
  return items.map((item: any) => {
    const qty = Math.max(0, Math.round(asNumber(item?.qty)));
    const unitPriceCents = Math.max(0, Math.round(asNumber(item?.unitPriceCents)));
    return {
      productId: asString(item?.productId),
      sku: asString(item?.sku),
      slug: asString(item?.slug),
      name: asString(item?.name, "Product"),
      qty,
      unitPriceCents,
      lineTotalCents: Math.max(
        0,
        Math.round(asNumber(item?.lineTotalCents, qty * unitPriceCents)),
      ),
    };
  }).filter((item) => item.qty > 0);
}

function timelineEvent(input: {
  type: "status" | "note";
  status?: string;
  note?: string;
  actor?: string;
}) {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    status: input.status,
    note: input.note,
    actor: input.actor ?? "System",
    createdAt: new Date().toISOString(),
  };
}

function parseHistory(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizePromotionCode(value: unknown) {
  return asString(value).trim().toUpperCase().replace(/\s+/g, "");
}

function promotionData(body: Record<string, unknown>, mode: "create" | "update") {
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.code === "string") data.code = normalizePromotionCode(body.code);
  if (["percentage", "fixed"].includes(asString(body.discountType))) {
    data.discountType = body.discountType;
  }
  if (typeof body.discountValue === "number") {
    const value = Math.max(1, Math.round(body.discountValue));
    data.discountValue = body.discountType === "percentage" ? Math.min(100, value) : value;
  }
  if (typeof body.minimumSpendCents === "number") {
    data.minimumSpendCents = Math.max(0, Math.round(body.minimumSpendCents));
  }
  if (typeof body.usageLimit === "number") {
    data.usageLimit = Math.max(0, Math.round(body.usageLimit));
  }
  if (typeof body.perCustomerLimit === "number") {
    data.perCustomerLimit = Math.max(0, Math.round(body.perCustomerLimit));
  }
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.startsAt === "string" || body.startsAt === null) data.startsAt = body.startsAt || null;
  if (typeof body.endsAt === "string" || body.endsAt === null) data.endsAt = body.endsAt || null;
  if (Array.isArray(body.productSlugs)) {
    data.productSlugs = body.productSlugs.map(normalizePromotionCode).map((slug) => slug.toLowerCase()).filter(Boolean);
  }
  if (mode === "create") {
    data.name ||= asString(data.code, "New promotion");
    data.discountType ||= "percentage";
    data.discountValue ||= 10;
    data.minimumSpendCents ||= 0;
    data.usageLimit ||= 0;
    data.perCustomerLimit ||= 0;
    data.productSlugs ||= [];
    if (!("active" in data)) data.active = true;
  }
  return data;
}

function promotionWindowError(data: Record<string, unknown>) {
  const startsAt = data.startsAt ? new Date(asString(data.startsAt)).getTime() : null;
  const endsAt = data.endsAt ? new Date(asString(data.endsAt)).getTime() : null;
  if (startsAt !== null && !Number.isFinite(startsAt)) return "Promotion start date is invalid.";
  if (endsAt !== null && !Number.isFinite(endsAt)) return "Promotion end date is invalid.";
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) {
    return "Promotion end date must be after its start date.";
  }
  return null;
}

async function evaluatePromotion(input: {
  code: unknown;
  items: any[];
  subtotalCents: number;
  email?: unknown;
}) {
  const code = normalizePromotionCode(input.code);
  if (!code) return { error: "Enter a coupon code." };

  const promotions = await (strapi.documents as any)("api::promotion.promotion").findMany({
    fields: [
      "documentId",
      "name",
      "code",
      "discountType",
      "discountValue",
      "startsAt",
      "endsAt",
      "usageLimit",
      "perCustomerLimit",
      "usageCount",
      "minimumSpendCents",
      "productSlugs",
      "active",
    ],
    filters: { code: { $eqi: code } },
    limit: 1,
  });
  const promotion = promotions[0];
  if (!promotion || !promotion.active) return { error: "Coupon is invalid or inactive." };

  const now = Date.now();
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now) {
    return { error: "Coupon is not active yet." };
  }
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() < now) {
    return { error: "Coupon has expired." };
  }
  const usageLimit = asNumber(promotion.usageLimit);
  const usageCount = asNumber(promotion.usageCount);
  if (usageLimit > 0 && usageCount >= usageLimit) {
    return { error: "Coupon usage limit has been reached." };
  }
  const perCustomerLimit = asNumber(promotion.perCustomerLimit);
  if (perCustomerLimit > 0) {
    const email = asString(input.email).trim();
    if (!email) {
      return { error: "Enter your email before applying this coupon." };
    }
    const redemptions = await strapi.documents("api::order.order").findMany({
      fields: ["documentId"],
      filters: {
        promotionCode: { $eqi: code },
        email: { $eqi: email },
        status: { $ne: "failed" },
      },
      limit: perCustomerLimit,
    });
    if (redemptions.length >= perCustomerLimit) {
      return { error: "You have already used this coupon the maximum number of times." };
    }
  }
  const subtotalCents = Math.max(0, Math.round(input.subtotalCents));
  if (subtotalCents < asNumber(promotion.minimumSpendCents)) {
    return {
      error: `Minimum spend is EUR ${(asNumber(promotion.minimumSpendCents) / 100).toFixed(2)}.`,
    };
  }

  const productSlugs = Array.isArray(promotion.productSlugs)
    ? promotion.productSlugs.map((slug: unknown) => asString(slug).toLowerCase())
    : [];
  const eligibleSubtotalCents = productSlugs.length === 0
    ? subtotalCents
    : input.items.reduce((sum, item) => {
        return productSlugs.includes(asString(item?.slug).toLowerCase())
          ? sum + Math.max(0, asNumber(item?.lineTotalCents))
          : sum;
      }, 0);
  if (eligibleSubtotalCents <= 0) {
    return { error: "Coupon does not apply to products in this cart." };
  }

  const discountValue = Math.max(1, asNumber(promotion.discountValue));
  const discountCents = promotion.discountType === "percentage"
    ? Math.round(eligibleSubtotalCents * Math.min(100, discountValue) / 100)
    : Math.min(eligibleSubtotalCents, discountValue);

  return {
    promotion,
    discountCents,
    eligibleSubtotalCents,
  };
}

async function recordInventoryMovement(input: {
  product: any;
  delta: number;
  balanceAfter: number;
  reason: string;
  reference?: string;
  actor?: string;
}) {
  if (!input.product?.documentId || input.delta === 0) return;

  await (strapi.documents as any)("api::inventory-movement.inventory-movement").create({
    data: {
      productDocumentId: input.product.documentId,
      productName: asString(input.product.name, "Product"),
      sku: asString(input.product.sku),
      slug: asString(input.product.slug),
      delta: input.delta,
      balanceAfter: input.balanceAfter,
      reason: input.reason,
      reference: input.reference,
      actor: input.actor ?? "System",
    },
  });
}

const batchDocuments = () => (strapi.documents as any)("api::inventory-batch.inventory-batch");
const reservationDocuments = () => (strapi.documents as any)("api::stock-reservation.stock-reservation");
const returnDocuments = () => (strapi.documents as any)("api::return-request.return-request");
const notificationDocuments = () => (strapi.documents as any)("api::notification-log.notification-log");

function adminIdentity(ctx: any) {
  return {
    actor: asString(ctx.get("x-jamora-admin-actor"), "Jamora Admin"),
    role: asString(ctx.get("x-jamora-admin-role"), "owner"),
  };
}

async function recordAudit(ctx: any, input: { action: string; entityType: string; entityId?: string; entityLabel?: string; details?: Record<string, unknown> }) {
  await (strapi.documents as any)("api::audit-log.audit-log").create({
    data: { ...input, ...adminIdentity(ctx), details: input.details ?? {} },
  });
}

async function logNotification(input: {
  recipient: string;
  template: string;
  subject: string;
  orderNumber?: string;
  payload?: Record<string, unknown>;
}) {
  if (!input.recipient) return;
  await notificationDocuments().create({
    data: {
      channel: "email",
      recipient: input.recipient,
      template: input.template,
      subject: input.subject,
      status: "simulated",
      orderNumber: input.orderNumber,
      payload: input.payload ?? {},
    },
  });
}

async function releaseReservationAllocations(reservation: any) {
  const allocations = Array.isArray(reservation?.allocations) ? reservation.allocations : [];
  for (const allocation of allocations) {
    if (!allocation.batchDocumentId) continue;
    const batch = await batchDocuments().findOne({ documentId: allocation.batchDocumentId });
    if (!batch) continue;
    await batchDocuments().update({
      documentId: batch.documentId,
      data: {
        reservedQuantity: Math.max(
          0,
          asNumber(batch.reservedQuantity) - asNumber(allocation.qty),
        ),
      },
    });
  }
}

async function expireReservations() {
  const expired = await reservationDocuments().findMany({
    filters: {
      status: { $eq: "reserved" },
      expiresAt: { $lt: new Date().toISOString() },
    },
    limit: 500,
  });
  for (const reservation of expired) {
    await releaseReservationAllocations(reservation);
    await reservationDocuments().update({
      documentId: reservation.documentId,
      data: { status: "expired" },
    });
  }
}

async function createStockReservation(items: any[], email = "") {
  await expireReservations();
  const activeReservations = await reservationDocuments().findMany({
    fields: ["allocations"],
    filters: { status: { $eq: "reserved" } },
    limit: 1000,
  });
  const virtuallyReserved = new Map<string, number>();
  for (const reservation of activeReservations) {
    for (const allocation of Array.isArray(reservation.allocations) ? reservation.allocations : []) {
      if (!allocation.batchDocumentId) {
        const slug = asString(allocation.slug);
        virtuallyReserved.set(slug, (virtuallyReserved.get(slug) ?? 0) + asNumber(allocation.qty));
      }
    }
  }

  const allocations: any[] = [];
  const batchUpdates = new Map<string, { batch: any; reservedQuantity: number }>();
  for (const item of items) {
    const slug = asString(item.slug);
    const qty = Math.max(0, Math.round(asNumber(item.qty)));
    if (!slug || qty <= 0) continue;
    const batches = await batchDocuments().findMany({
      filters: { slug: { $eq: slug } },
      sort: { expiryDate: "asc" },
      limit: 200,
    });
    const usable = batches.filter((batch: any) => {
      return batch.status === "active" && (!batch.expiryDate || new Date(batch.expiryDate).getTime() >= Date.now());
    });

    let remaining = qty;
    if (usable.length > 0) {
      for (const batch of usable) {
        const planned = batchUpdates.get(batch.documentId)?.reservedQuantity ?? asNumber(batch.reservedQuantity);
        const available = Math.max(0, asNumber(batch.quantity) - planned);
        const take = Math.min(remaining, available);
        if (take <= 0) continue;
        allocations.push({
          productDocumentId: item.productId,
          slug,
          sku: item.sku,
          name: item.name,
          batchDocumentId: batch.documentId,
          batchNumber: batch.batchNumber,
          productionDate: batch.productionDate,
          expiryDate: batch.expiryDate,
          qty: take,
        });
        batchUpdates.set(batch.documentId, { batch, reservedQuantity: planned + take });
        remaining -= take;
        if (remaining === 0) break;
      }
      if (remaining === 0) continue;
    }

    const products = await strapi.documents("api::product.product").findMany({
      fields: ["documentId", "slug", "stock"],
      filters: { slug: { $eq: slug } },
      limit: 1,
    });
    const product = products[0] as any;
    const trackedBatchQuantity = batches.reduce(
      (sum: number, batch: any) => sum + asNumber(batch.quantity),
      0,
    );
    const available = Math.max(
      0,
      asNumber(product?.stock) - trackedBatchQuantity - (virtuallyReserved.get(slug) ?? 0),
    );
    if (!product || available < remaining) {
      return { error: `Only ${qty - remaining + available} unit(s) of ${item.name} are available.` };
    }
    virtuallyReserved.set(slug, (virtuallyReserved.get(slug) ?? 0) + remaining);
    allocations.push({
      productDocumentId: product.documentId,
      slug,
      sku: item.sku,
      name: item.name,
      batchDocumentId: null,
      batchNumber: "LEGACY-STOCK",
      qty: remaining,
    });
  }

  for (const { batch, reservedQuantity } of batchUpdates.values()) {
    await batchDocuments().update({
      documentId: batch.documentId,
      data: { reservedQuantity },
    });
  }
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const token = `rsv_${crypto.randomUUID()}`;
  const reservation = await reservationDocuments().create({
    data: { token, status: "reserved", allocations, expiresAt, email },
  });
  return { reservation };
}

async function consumeReservation(token: string, orderNumber: string) {
  if (!token) return { allocations: [] };
  await expireReservations();
  const matches = await reservationDocuments().findMany({
    filters: { token: { $eq: token }, status: { $eq: "reserved" } },
    limit: 1,
  });
  const reservation = matches[0];
  if (!reservation) return { error: "Stock reservation expired or was already used." };
  const allocations = Array.isArray(reservation.allocations) ? reservation.allocations : [];
  for (const allocation of allocations) {
    if (!allocation.batchDocumentId) continue;
    const batch = await batchDocuments().findOne({ documentId: allocation.batchDocumentId });
    if (!batch) return { error: `Batch ${allocation.batchNumber} is unavailable.` };
    const quantity = Math.max(0, asNumber(batch.quantity) - asNumber(allocation.qty));
    const reservedQuantity = Math.max(0, asNumber(batch.reservedQuantity) - asNumber(allocation.qty));
    await batchDocuments().update({
      documentId: batch.documentId,
      data: {
        quantity,
        reservedQuantity,
        status: quantity === 0 ? "depleted" : batch.status,
      },
    });
  }
  await reservationDocuments().update({
    documentId: reservation.documentId,
    data: { status: "consumed", orderNumber },
  });
  return { allocations };
}

async function enrichBatchAllocations(value: unknown) {
  const allocations = Array.isArray(value) ? value : [];
  return Promise.all(
    allocations.map(async (allocation: any) => {
      if (allocation?.productionDate || !allocation?.batchDocumentId) {
        return allocation;
      }
      const batch = await batchDocuments().findOne({
        documentId: allocation.batchDocumentId,
        fields: ["batchNumber", "productionDate", "expiryDate"],
      });
      return batch
        ? {
            ...allocation,
            batchNumber: allocation.batchNumber || batch.batchNumber,
            productionDate: batch.productionDate,
            expiryDate: allocation.expiryDate || batch.expiryDate,
          }
        : allocation;
    }),
  );
}

async function decrementProductStock(items: any[], reference: string) {
  for (const item of items) {
    const slug = asString(item.slug);
    const qty = Math.max(0, Math.round(asNumber(item.qty)));
    if (!slug || qty <= 0) continue;

    const products = await strapi.documents("api::product.product").findMany({
      fields: ["documentId", "name", "sku", "slug", "stock"],
      filters: { slug: { $eq: slug } },
      limit: 1,
    });
    const product = products[0] as any;
    if (!product?.documentId || typeof product.stock !== "number") continue;

    const balanceAfter = Math.max(0, product.stock - qty);
    await strapi.documents("api::product.product").update({
      documentId: product.documentId,
      data: {
        stock: balanceAfter,
      } as any,
      status: "published",
    } as any);
    await recordInventoryMovement({
      product,
      delta: balanceAfter - product.stock,
      balanceAfter,
      reason: "sale",
      reference,
      actor: "Checkout",
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

  async reserveStock(ctx) {
    const body = ctx.request.body ?? {};
    const items = normalizeOrderItems(Array.isArray(body.items) ? body.items : []);
    if (items.length === 0) {
      ctx.status = 400;
      ctx.body = { error: "Cart is empty." };
      return;
    }
    const result = await createStockReservation(items, asString(body.email));
    if ("error" in result) {
      ctx.status = 409;
      ctx.body = result;
      return;
    }
    ctx.body = {
      ok: true,
      reservationToken: result.reservation.token,
      expiresAt: result.reservation.expiresAt,
      allocations: result.reservation.allocations,
    };
  },

  async mockPaidOrder(ctx) {
    const body = ctx.request.body ?? {};
    const items = normalizeOrderItems(Array.isArray(body.items) ? body.items : []);
    const subtotalCents = Math.max(0, asNumber(body.subtotalCents));
    const shippingCents = Math.max(0, asNumber(body.shippingCents));
    const orderNumber = asString(body.orderNumber);
    if (!orderNumber) {
      ctx.status = 400;
      ctx.body = { error: "Order number is required." };
      return;
    }

    const existing = await strapi.documents("api::order.order").findMany({
      fields: ["documentId", "orderNumber"],
      filters: { orderNumber: { $eq: orderNumber } },
      limit: 1,
    });
    if (existing[0]) {
      ctx.body = { ok: true, order: existing[0], duplicate: true };
      return;
    }

    const promotionResult = body.promotionCode
      ? await evaluatePromotion({
          code: body.promotionCode,
          items,
          subtotalCents,
          email: body.customer?.email,
        })
      : null;
    if (promotionResult && "error" in promotionResult) {
      ctx.status = 400;
      ctx.body = { error: promotionResult.error };
      return;
    }
    const discountCents = promotionResult?.discountCents ?? 0;
    const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);
    const reservationToken = asString(body.reservationToken);
    let reservedAllocations: any[] = [];
    if (reservationToken) {
      await expireReservations();
      const reservations = await reservationDocuments().findMany({
        fields: ["documentId", "allocations", "expiresAt"],
        filters: { token: { $eq: reservationToken }, status: { $eq: "reserved" } },
        limit: 1,
      });
      if (!reservations[0]) {
        ctx.status = 409;
        ctx.body = { error: "Stock reservation expired. Please try checkout again." };
        return;
      }
      reservedAllocations = Array.isArray(reservations[0].allocations)
        ? reservations[0].allocations
        : [];
    }

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
        subtotalCents,
        shippingCents,
        discountCents,
        promotionCode: promotionResult?.promotion?.code,
        totalCents,
        estimatedProfitCents,
        stripeSessionId: asString(body.stripeSessionId, "mock-paid-checkout"),
        invoiceNumber: orderNumber.replace(/^JMR-/, "INV-"),
        items,
        statusHistory: [
          timelineEvent({
            type: "status",
            status: "paid",
            note: "Payment confirmed in test mode.",
            actor: "Checkout",
          }),
        ],
        reservationToken,
        batchAllocations: reservedAllocations,
        fulfilmentChecklist: items.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          checked: false,
        })),
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

    await decrementProductStock(items, orderNumber);
    if (reservationToken) {
      const consumed = await consumeReservation(reservationToken, orderNumber);
      if ("error" in consumed) strapi.log.warn(consumed.error);
    }

    if (promotionResult?.promotion?.documentId) {
      await (strapi.documents as any)("api::promotion.promotion").update({
        documentId: promotionResult.promotion.documentId,
        data: {
          usageCount: asNumber(promotionResult.promotion.usageCount) + 1,
        },
      });
    }

    await logNotification({
      recipient: asString(body.customer?.email, "customer@example.com"),
      template: "order_confirmed",
      subject: `Jamora order ${orderNumber} confirmed`,
      orderNumber,
      payload: { status: "paid", totalCents },
    });

    ctx.body = { ok: true, order };
  },

  async validatePromotion(ctx) {
    const body = ctx.request.body ?? {};
    const items = normalizeOrderItems(Array.isArray(body.items) ? body.items : []);
    const result = await evaluatePromotion({
      code: body.code,
      items,
      subtotalCents: asNumber(body.subtotalCents),
      email: body.email,
    });
    if ("error" in result) {
      ctx.status = 400;
      ctx.body = { valid: false, error: result.error };
      return;
    }

    ctx.body = {
      valid: true,
      promotion: {
        code: result.promotion.code,
        name: result.promotion.name,
        discountType: result.promotion.discountType,
        discountValue: result.promotion.discountValue,
        productSlugs: result.promotion.productSlugs,
      },
      discountCents: result.discountCents,
      eligibleSubtotalCents: result.eligibleSubtotalCents,
    };
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
        "subtotalCents",
        "shippingCents",
        "discountCents",
        "promotionCode",
        "totalCents",
        "invoiceNumber",
        "items",
        "statusHistory",
        "batchAllocations",
        "fulfilmentChecklist",
        "packedBy",
        "packedAt",
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

    const batchAllocations = await enrichBatchAllocations(
      (order as any).batchAllocations,
    );
    ctx.body = {
      order: {
        ...order,
        batchAllocations,
        statusHistory: parseHistory((order as any).statusHistory).filter(
          (event: any) => event?.type === "status",
        ),
      },
    };
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
        "subtotalCents",
        "shippingCents",
        "discountCents",
        "promotionCode",
        "totalCents",
        "estimatedProfitCents",
        "invoiceNumber",
        "items",
        "statusHistory",
        "batchAllocations",
        "fulfilmentChecklist",
        "packedBy",
        "packedAt",
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

  async adminCustomers(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const orders = await strapi.documents("api::order.order").findMany({
      fields: [
        "documentId",
        "orderNumber",
        "customerName",
        "email",
        "status",
        "totalCents",
        "shippingAddressText",
        "createdAt",
      ],
      sort: { createdAt: "desc" },
      limit: 10000,
    });
    const revenueStatuses = new Set(["paid", "processing", "shipped", "fulfilled"]);
    const customers = new Map<string, any>();

    for (const order of orders as any[]) {
      const email = asString(order.email).trim();
      const key = email.toLowerCase();
      if (!key) continue;
      const existing = customers.get(key) ?? {
        email,
        customerName: asString(order.customerName),
        shippingAddressText: asString(order.shippingAddressText),
        orderCount: 0,
        paidOrderCount: 0,
        refundedOrderCount: 0,
        lifetimeValueCents: 0,
        lastOrderAt: order.createdAt,
        lastOrderNumber: order.orderNumber,
        lastOrderDocumentId: order.documentId,
        lastOrderStatus: order.status,
      };

      existing.orderCount += 1;
      if (revenueStatuses.has(order.status)) {
        existing.paidOrderCount += 1;
        existing.lifetimeValueCents += Math.max(0, asNumber(order.totalCents));
      }
      if (order.status === "refunded") existing.refundedOrderCount += 1;
      if (!existing.customerName && order.customerName) existing.customerName = order.customerName;
      if (!existing.shippingAddressText && order.shippingAddressText) {
        existing.shippingAddressText = order.shippingAddressText;
      }
      customers.set(key, existing);
    }

    ctx.body = { customers: Array.from(customers.values()) };
  },

  async adminUpdateOrder(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const body = ctx.request.body ?? {};
    const data: Record<string, unknown> = {};
    const status = asOrderStatus(body.status);
    const existing = await strapi.documents("api::order.order").findOne({
      documentId: ctx.params.documentId,
      fields: ["status", "statusHistory", "orderNumber", "email", "trackingNumber", "fulfilmentChecklist", "packedBy"],
    });
    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: "Order not found." };
      return;
    }

    const existingHistory = parseHistory((existing as any).statusHistory);
    const history = [...existingHistory];
    if (status) {
      data.status = status;
      if (status !== (existing as any).status) {
        history.push(timelineEvent({
          type: "status",
          status,
          note: asString(body.note) || `Order moved to ${status}.`,
          actor: "Admin",
        }));
      }
    }
    const note = asString(body.note).trim();
    if (note && (!status || status === (existing as any).status)) {
      history.push(timelineEvent({ type: "note", note, actor: "Admin" }));
    }
    if (history.length !== existingHistory.length) {
      data.statusHistory = history;
    }
    if (typeof body.trackingNumber === "string") data.trackingNumber = body.trackingNumber.trim();
    if (typeof body.carrier === "string") data.carrier = body.carrier.trim();
    if (typeof body.estimatedDelivery === "string") data.estimatedDelivery = body.estimatedDelivery;
    if (Array.isArray(body.fulfilmentChecklist)) {
      data.fulfilmentChecklist = body.fulfilmentChecklist.map((item: any) => ({
        productId: asString(item.productId),
        sku: asString(item.sku),
        name: asString(item.name),
        qty: Math.max(0, asNumber(item.qty)),
        scannedQty: Math.max(0, asNumber(item.scannedQty)),
        checked: Boolean(item.checked),
      }));
      const allChecked = (data.fulfilmentChecklist as any[]).length > 0 && (data.fulfilmentChecklist as any[]).every((item) => item.checked);
      data.packedAt = allChecked && asString(body.packedBy, asString((existing as any).packedBy)).trim()
        ? new Date().toISOString()
        : null;
    }
    if (typeof body.packedBy === "string") data.packedBy = body.packedBy.trim();
    const finalChecklist = Array.isArray(data.fulfilmentChecklist)
      ? data.fulfilmentChecklist
      : Array.isArray((existing as any).fulfilmentChecklist)
        ? (existing as any).fulfilmentChecklist
        : [];
    if (status === "shipped" && (finalChecklist.length === 0 || !finalChecklist.every((item: any) => item.checked))) {
      ctx.status = 400;
      ctx.body = { error: "Complete the pick & pack checklist before shipping." };
      return;
    }

    const order = await strapi.documents("api::order.order").update({
      documentId: ctx.params.documentId,
      data: data as any,
    });
    await recordAudit(ctx, { action: "order.updated", entityType: "order", entityId: order.documentId, entityLabel: (existing as any).orderNumber, details: { status: data.status, trackingNumber: data.trackingNumber, packedBy: data.packedBy } });

    if (status && status !== (existing as any).status) {
      const templates: Record<string, { template: string; subject: string }> = {
        processing: { template: "order_processing", subject: `Jamora order ${(existing as any).orderNumber} is being prepared` },
        shipped: { template: "order_shipped", subject: `Jamora order ${(existing as any).orderNumber} has shipped` },
        fulfilled: { template: "order_delivered", subject: `Jamora order ${(existing as any).orderNumber} was delivered` },
        refunded: { template: "order_refunded", subject: `Jamora order ${(existing as any).orderNumber} was refunded` },
      };
      const notification = templates[status];
      if (notification) {
        await logNotification({
          recipient: asString((existing as any).email),
          orderNumber: asString((existing as any).orderNumber),
          ...notification,
          payload: { status, trackingNumber: asString(body.trackingNumber, asString((existing as any).trackingNumber)) },
        });
      }
    }

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
    const existing = await strapi.documents("api::product.product").findOne({
      documentId: ctx.params.documentId,
      fields: ["documentId", "name", "sku", "slug", "stock"],
    });
    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: "Product not found." };
      return;
    }

    const product = await strapi.documents("api::product.product").update({
      documentId: ctx.params.documentId,
      data: data as any,
      status: "published",
    } as any);

    if (typeof data.stock === "number" && data.stock !== (existing as any).stock) {
      await recordInventoryMovement({
        product: { ...existing, ...product },
        delta: data.stock - asNumber((existing as any).stock),
        balanceAfter: data.stock,
        reason: ["restock", "correction"].includes(asString(body.stockReason))
          ? asString(body.stockReason)
          : "manual_adjustment",
        reference: asString(body.stockReference),
        actor: "Admin",
      });
    }
    await recordAudit(ctx, { action: "product.updated", entityType: "product", entityId: product.documentId, entityLabel: product.name, details: { changedFields: Object.keys(data) } });

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

    if (asNumber((product as any).stock) > 0) {
      await recordInventoryMovement({
        product,
        delta: asNumber((product as any).stock),
        balanceAfter: asNumber((product as any).stock),
        reason: "initial_stock",
        reference: "Product created",
        actor: "Admin",
      });
    }
    await recordAudit(ctx, { action: "product.created", entityType: "product", entityId: product.documentId, entityLabel: product.name });

    ctx.body = { ok: true, product };
  },

  async adminInventoryMovements(ctx) {
    if (!requireAdminSecret(ctx)) return;

    const movements = await (strapi.documents as any)(
      "api::inventory-movement.inventory-movement",
    ).findMany({
      fields: [
        "documentId",
        "productDocumentId",
        "productName",
        "sku",
        "slug",
        "delta",
        "balanceAfter",
        "reason",
        "reference",
        "actor",
        "createdAt",
      ],
      sort: { createdAt: "desc" },
      limit: 250,
    });

    ctx.body = { movements };
  },

  async adminInventoryBatches(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const batches = await batchDocuments().findMany({
      sort: { expiryDate: "asc" },
      limit: 1000,
    });
    ctx.body = {
      batches: batches.map((batch: any) => ({
        ...batch,
        daysUntilExpiry: batch.expiryDate
          ? Math.ceil((new Date(batch.expiryDate).getTime() - Date.now()) / 86400000)
          : null,
      })),
    };
  },

  async adminCreateInventoryBatch(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const body = ctx.request.body ?? {};
    const product = await strapi.documents("api::product.product").findOne({
      documentId: asString(body.productDocumentId),
      fields: ["documentId", "name", "sku", "slug", "stock"],
    });
    if (!product || !asString(body.batchNumber) || !asString(body.productionDate) || !asString(body.expiryDate)) {
      ctx.status = 400;
      ctx.body = { error: "Product, batch number, production date, and expiry date are required." };
      return;
    }
    const batchNumber = asString(body.batchNumber).trim().toUpperCase();
    const duplicate = await batchDocuments().findMany({ filters: { batchNumber: { $eqi: batchNumber } }, limit: 1 });
    if (duplicate[0]) {
      ctx.status = 409;
      ctx.body = { error: `Batch ${batchNumber} already exists.` };
      return;
    }
    const quantity = Math.max(0, Math.round(asNumber(body.quantity)));
    const batch = await batchDocuments().create({
      data: {
        productDocumentId: product.documentId,
        productName: product.name,
        sku: (product as any).sku,
        slug: product.slug,
        batchNumber,
        quantity,
        reservedQuantity: 0,
        productionDate: asString(body.productionDate) || null,
        expiryDate: asString(body.expiryDate),
        certificateUrl: asString(body.certificateUrl),
        status: "active",
      },
    });
    if (body.adjustProductStock !== false && quantity > 0) {
      const balanceAfter = asNumber((product as any).stock) + quantity;
      await strapi.documents("api::product.product").update({
        documentId: product.documentId,
        data: { stock: balanceAfter } as any,
        status: "published",
      } as any);
      await recordInventoryMovement({
        product,
        delta: quantity,
        balanceAfter,
        reason: "restock",
        reference: batch.batchNumber,
        actor: "Batch receiving",
      });
    }
    await recordAudit(ctx, { action: "batch.received", entityType: "inventory-batch", entityId: batch.documentId, entityLabel: batch.batchNumber, details: { product: product.name, quantity } });
    ctx.body = { ok: true, batch };
  },

  async adminUpdateInventoryBatch(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const body = ctx.request.body ?? {};
    const data: Record<string, unknown> = {};
    if (["active", "quarantined", "depleted"].includes(asString(body.status))) data.status = body.status;
    if (typeof body.certificateUrl === "string") data.certificateUrl = body.certificateUrl.trim();
    if (typeof body.expiryDate === "string") data.expiryDate = body.expiryDate;
    const batch = await batchDocuments().update({ documentId: ctx.params.documentId, data });
    await recordAudit(ctx, { action: "batch.updated", entityType: "inventory-batch", entityId: batch.documentId, entityLabel: batch.batchNumber, details: data });
    ctx.body = { ok: true, batch };
  },

  async adminReturns(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const returns = await returnDocuments().findMany({ sort: { createdAt: "desc" }, limit: 1000 });
    ctx.body = { returns };
  },

  async adminCreateReturn(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const body = ctx.request.body ?? {};
    const order = await strapi.documents("api::order.order").findOne({
      documentId: asString(body.orderDocumentId),
      fields: ["documentId", "orderNumber", "email", "items"],
    });
    if (!order || !asString(body.reason)) {
      ctx.status = 400;
      ctx.body = { error: "Order and return reason are required." };
      return;
    }
    const suffix = Math.floor(100000 + Math.random() * 900000);
    const returnRequest = await returnDocuments().create({
      data: {
        returnNumber: `RMA-${new Date().getFullYear()}-${suffix}`,
        orderDocumentId: order.documentId,
        orderNumber: order.orderNumber,
        email: order.email,
        items: Array.isArray(body.items) && body.items.length > 0 ? body.items : (order as any).items ?? [],
        reason: asString(body.reason),
        status: "requested",
        restock: false,
      },
    });
    await logNotification({
      recipient: asString(order.email),
      template: "return_requested",
      subject: `Return ${returnRequest.returnNumber} created`,
      orderNumber: asString(order.orderNumber),
      payload: { returnNumber: returnRequest.returnNumber },
    });
    ctx.body = { ok: true, return: returnRequest };
  },

  async adminUpdateReturn(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const body = ctx.request.body ?? {};
    const existing = await returnDocuments().findOne({ documentId: ctx.params.documentId });
    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: "Return not found." };
      return;
    }
    const status = ["requested", "approved", "rejected", "received", "refunded"].includes(asString(body.status))
      ? asString(body.status)
      : existing.status;
    const shouldRestock = Boolean(body.restock) && status === "received" && existing.status !== "received";
    if (shouldRestock) {
      for (const item of Array.isArray(existing.items) ? existing.items : []) {
        const products = await strapi.documents("api::product.product").findMany({
          fields: ["documentId", "name", "sku", "slug", "stock"],
          filters: { slug: { $eq: asString(item.slug) } },
          limit: 1,
        });
        const product = products[0] as any;
        if (!product) continue;
        const qty = Math.max(0, Math.round(asNumber(item.qty)));
        const balanceAfter = asNumber(product.stock) + qty;
        await strapi.documents("api::product.product").update({
          documentId: product.documentId,
          data: { stock: balanceAfter } as any,
          status: "published",
        } as any);
        await recordInventoryMovement({
          product,
          delta: qty,
          balanceAfter,
          reason: "refund",
          reference: existing.returnNumber,
          actor: "Returns",
        });
      }
    }
    const updated = await returnDocuments().update({
      documentId: existing.documentId,
      data: {
        status,
        restock: shouldRestock || Boolean(existing.restock),
        adminNote: typeof body.adminNote === "string" ? body.adminNote.trim() : existing.adminNote,
      },
    });
    if (status !== existing.status) {
      await logNotification({
        recipient: asString(existing.email),
        template: `return_${status}`,
        subject: `Return ${existing.returnNumber} is ${status}`,
        orderNumber: asString(existing.orderNumber),
        payload: { returnNumber: existing.returnNumber, status },
      });
    }
    ctx.body = { ok: true, return: updated };
  },

  async adminNotifications(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const notifications = await notificationDocuments().findMany({
      sort: { createdAt: "desc" },
      limit: 250,
    });
    ctx.body = { notifications };
  },

  async adminPromotions(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const promotions = await (strapi.documents as any)("api::promotion.promotion").findMany({
      sort: { createdAt: "desc" },
      limit: 500,
    });
    ctx.body = { promotions };
  },

  async adminCreatePromotion(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const data = promotionData(ctx.request.body ?? {}, "create");
    if (!data.code) {
      ctx.status = 400;
      ctx.body = { error: "Promotion code is required." };
      return;
    }
    const windowError = promotionWindowError(data);
    if (windowError) {
      ctx.status = 400;
      ctx.body = { error: windowError };
      return;
    }
    const duplicates = await (strapi.documents as any)("api::promotion.promotion").findMany({
      fields: ["documentId"],
      filters: { code: { $eqi: data.code } },
      limit: 1,
    });
    if (duplicates[0]) {
      ctx.status = 409;
      ctx.body = { error: "Promotion code already exists." };
      return;
    }
    const promotion = await (strapi.documents as any)("api::promotion.promotion").create({
      data: { ...data, usageCount: 0 },
    });
    await recordAudit(ctx, { action: "promotion.created", entityType: "promotion", entityId: promotion.documentId, entityLabel: promotion.code });
    ctx.body = { ok: true, promotion };
  },

  async adminUpdatePromotion(ctx) {
    if (!requireAdminSecret(ctx)) return;
    const data = promotionData(ctx.request.body ?? {}, "update");
    const existing = await (strapi.documents as any)("api::promotion.promotion").findOne({
      documentId: ctx.params.documentId,
      fields: ["documentId", "code", "startsAt", "endsAt"],
    });
    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: "Promotion not found." };
      return;
    }
    const windowError = promotionWindowError({ ...existing, ...data });
    if (windowError) {
      ctx.status = 400;
      ctx.body = { error: windowError };
      return;
    }
    if (data.code && data.code !== existing.code) {
      const duplicates = await (strapi.documents as any)("api::promotion.promotion").findMany({
        fields: ["documentId"],
        filters: { code: { $eqi: data.code } },
        limit: 2,
      });
      if (duplicates.some((promotion: any) => promotion.documentId !== existing.documentId)) {
        ctx.status = 409;
        ctx.body = { error: "Promotion code already exists." };
        return;
      }
    }
    const promotion = await (strapi.documents as any)("api::promotion.promotion").update({
      documentId: ctx.params.documentId,
      data,
    });
    await recordAudit(ctx, { action: "promotion.updated", entityType: "promotion", entityId: promotion.documentId, entityLabel: promotion.code, details: { changedFields: Object.keys(data) } });
    ctx.body = { ok: true, promotion };
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
        "heroEyebrowRo",
        "heroTitleRo",
        "heroHighlightRo",
        "heroDescriptionRo",
        "primaryCtaLabelRo",
        "secondaryCtaLabelRo",
        "pillarsEyebrow",
        "pillarsTitle",
        "featuredEyebrow",
        "featuredTitle",
        "storyEyebrow",
        "storyTitle",
        "storyDescription",
        "pillarsEyebrowRo",
        "pillarsTitleRo",
        "featuredEyebrowRo",
        "featuredTitleRo",
        "storyEyebrowRo",
        "storyTitleRo",
        "storyDescriptionRo",
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

    await recordAudit(ctx, { action: "content.updated", entityType: "store-content", entityId: content.documentId, entityLabel: "Storefront content", details: { changedFields: Object.keys(data) } });

    ctx.body = { ok: true, content };
  },
};
