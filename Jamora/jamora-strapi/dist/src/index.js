"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const products_1 = require("./seed/products");
exports.default = {
    async bootstrap({ strapi }) {
        await seedProducts(strapi);
        await seedStoreContent(strapi);
        await backfillProductStockThresholds(strapi);
        await backfillProductSkus(strapi);
        await enablePublicProductRead(strapi);
        await configureOrderListView(strapi);
    },
};
async function seedProducts(strapi) {
    const existing = await strapi.documents("api::product.product").findMany({
        fields: ["slug"],
        limit: 1,
    });
    if (existing.length > 0)
        return;
    for (const product of products_1.products) {
        await strapi.documents("api::product.product").create({
            data: {
                ...product,
                publishedAt: new Date(),
            },
        });
    }
    strapi.log.info(`Seeded ${products_1.products.length} Jamora products`);
}
async function backfillProductSkus(strapi) {
    var _a;
    const existing = await strapi.documents("api::product.product").findMany({
        fields: ["documentId", "slug", "sku"],
        limit: 1000,
    });
    for (const product of existing) {
        if (product.sku)
            continue;
        const sku = `JM-${String((_a = product.slug) !== null && _a !== void 0 ? _a : product.documentId)
            .replace(/[^a-z0-9]/gi, "")
            .slice(0, 12)
            .toUpperCase()}`;
        await strapi.documents("api::product.product").update({
            documentId: product.documentId,
            data: { sku },
            status: "published",
        });
    }
}
async function seedStoreContent(strapi) {
    const existing = await strapi.documents("api::store-content.store-content").findFirst({
        fields: ["documentId"],
    });
    if (existing)
        return;
    await strapi.documents("api::store-content.store-content").create({
        data: {
            heroEyebrow: "Energi · Digestie · Echlibru",
            heroTitle: "100% Made in Indonesia,",
            heroHighlight: "standardised for Europe.",
            heroDescription: "Premium jamu - Indonesia's living herbal tradition - refined to European standards of purity, transparency, and taste.",
            primaryCtaLabel: "Explore the collection",
            secondaryCtaLabel: "Our story",
            heroEyebrowRo: "Energie · Digestie · Echilibru",
            heroTitleRo: "100% produs in Indonezia,",
            heroHighlightRo: "standardizat pentru Europa.",
            heroDescriptionRo: "Jamu premium - traditia vie a plantelor indoneziene - rafinat pentru standarde europene de puritate, transparenta si gust.",
            primaryCtaLabelRo: "Exploreaza colectia",
            secondaryCtaLabelRo: "Povestea noastra",
            pillarsEyebrow: "Three pillars",
            pillarsTitle: "One tradition, three ways to feel well.",
            featuredEyebrow: "Best sellers",
            featuredTitle: "Loved across Europe",
            storyEyebrow: "From root to cup",
            storyTitle: "Traceable botanicals, standardised potency.",
            storyDescription: "Every batch is single-origin, lab-verified for active compounds, and documented from the Javanese highlands to your kitchen.",
            pillarsEyebrowRo: "Trei directii",
            pillarsTitleRo: "O traditie, trei moduri de a te simti bine.",
            featuredEyebrowRo: "Cele mai iubite",
            featuredTitleRo: "Apreciate in Europa",
            storyEyebrowRo: "De la radacina la ceasca",
            storyTitleRo: "Plante trasabile, putere standardizata.",
            storyDescriptionRo: "Fiecare lot are origine unica, este verificat in laborator pentru compusi activi si documentat din zonele inalte ale Javei pana in bucataria ta.",
            certifications: ["Organic", "Vegan", "EU Compliant", "GMP", "Non-GMO"],
            publishedAt: new Date(),
        },
    });
}
async function backfillProductStockThresholds(strapi) {
    const existing = await strapi.documents("api::product.product").findMany({
        fields: ["documentId", "minStock", "maxStock"],
        limit: 1000,
    });
    for (const product of existing) {
        if (typeof product.minStock === "number" && typeof product.maxStock === "number")
            continue;
        await strapi.documents("api::product.product").update({
            documentId: product.documentId,
            data: {
                minStock: typeof product.minStock === "number" ? product.minStock : 10,
                maxStock: typeof product.maxStock === "number" ? product.maxStock : 100,
            },
            status: "published",
        });
    }
}
async function enablePublicProductRead(strapi) {
    var _a, _b, _c, _d;
    const pluginStore = strapi.store({
        type: "plugin",
        name: "users-permissions",
    });
    const grant = await pluginStore.get({ key: "grant" });
    if (!(grant === null || grant === void 0 ? void 0 : grant.public))
        return;
    (_a = grant.public).permissions || (_a.permissions = {});
    (_b = grant.public.permissions).product || (_b.product = {});
    (_c = grant.public.permissions.product).controllers || (_c.controllers = {});
    (_d = grant.public.permissions.product.controllers).product || (_d.product = {});
    grant.public.permissions.product.controllers.product.find = { enabled: true };
    grant.public.permissions.product.controllers.product.findOne = { enabled: true };
    await pluginStore.set({ key: "grant", value: grant });
}
async function configureOrderListView(strapi) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const store = strapi.store({
            type: "plugin",
            name: "content-manager",
        });
        const key = "configuration_content_types::api::order.order";
        const existing = (_a = (await store.get({ key }))) !== null && _a !== void 0 ? _a : {};
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
                        ...((_c = (_b = existing.metadatas) === null || _b === void 0 ? void 0 : _b.orderNumber) !== null && _c !== void 0 ? _c : {}),
                        list: {
                            ...((_f = (_e = (_d = existing.metadatas) === null || _d === void 0 ? void 0 : _d.orderNumber) === null || _e === void 0 ? void 0 : _e.list) !== null && _f !== void 0 ? _f : {}),
                            label: "No Order",
                            searchable: true,
                            sortable: true,
                        },
                        edit: {
                            ...((_j = (_h = (_g = existing.metadatas) === null || _g === void 0 ? void 0 : _g.orderNumber) === null || _h === void 0 ? void 0 : _h.edit) !== null && _j !== void 0 ? _j : {}),
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
    }
    catch (error) {
        strapi.log.warn("Could not apply Jamora order list view configuration");
    }
}
function fieldMeta(existing, name, label, readonly) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
        ...((_b = (_a = existing.metadatas) === null || _a === void 0 ? void 0 : _a[name]) !== null && _b !== void 0 ? _b : {}),
        list: {
            ...((_e = (_d = (_c = existing.metadatas) === null || _c === void 0 ? void 0 : _c[name]) === null || _d === void 0 ? void 0 : _d.list) !== null && _e !== void 0 ? _e : {}),
            label,
        },
        edit: {
            ...((_h = (_g = (_f = existing.metadatas) === null || _f === void 0 ? void 0 : _f[name]) === null || _g === void 0 ? void 0 : _g.edit) !== null && _h !== void 0 ? _h : {}),
            label,
            description: readonly ? "Generated automatically by Jamora." : undefined,
            editable: !readonly,
            disabled: readonly,
        },
    };
}
