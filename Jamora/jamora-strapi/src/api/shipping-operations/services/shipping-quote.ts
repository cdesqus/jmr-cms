import {
  quoteShipping as createQuotes,
  selectShippingQuote as selectQuote,
  validateShippingSnapshot as validateSnapshot,
} from "./shipping-domain.cjs";
import { isDeepStrictEqual } from "node:util";
import {
  assertShippingProviderMode,
} from "./shipping-provider-config.cjs";
import {
  authoritativeRonTotals,
  parseDecimalRate,
} from "./ron-money.cjs";

const PRODUCT_UID = "api::product.product";
const ORDER_UID = "api::order.order";
const CHECKOUT_UID = "api::membership-checkout.membership-checkout";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function enabled() {
  if (process.env.SHIPPING_ENABLED !== "true") throw new Error("Not found.");
  assertShippingProviderMode(process.env);
}

function quoteSecret() {
  return process.env.SHIPPING_QUOTE_SECRET ||
    process.env.JAMORA_STOREFRONT_API_SECRET;
}

function requestedSlugs(items: unknown) {
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((item: any) => text(item?.slug)).filter(Boolean))];
}

function withTransaction(trx: any, value: any) {
  return trx ? { ...value, transacting: trx } : value;
}

function parseRate(value: unknown) {
  return parseDecimalRate(
    value,
    process.env.DEMO_EUR_RON_RATE || "4.975000",
  );
}

export function assertShippingSubjectOwner(
  subject: any,
  input: any,
  subjectType: "order" | "membership_checkout",
) {
  if (subjectType === "membership_checkout") {
    if (!input.customerDocumentId ||
        subject?.customerDocumentId !== input.customerDocumentId) {
      throw new Error("Shipping subject not found.");
    }
    return;
  }
  if (input.customerDocumentId) {
    if (subject?.customerDocumentId !== input.customerDocumentId) {
      throw new Error("Shipping subject not found.");
    }
    return;
  }
  const capability = text(input.guestCheckoutCapability);
  if (!capability || subject?.reservationToken !== capability) {
    throw new Error("Shipping subject not found.");
  }
}

export default ({ strapi }: { strapi: any }) => {
  const productQuery = () => strapi.db.query(PRODUCT_UID);

  function productPublication() {
    const localized =
      strapi.contentTypes?.[PRODUCT_UID]?.pluginOptions?.i18n?.localized === true;
    const locale = localized
      ? text(process.env.SHIPPING_PRODUCT_LOCALE || "en")
      : null;
    if (localized && !locale) {
      throw new Error("Authoritative shipping product locale is required.");
    }
    return { localized, locale };
  }

  function productQueryShape(
    where: Record<string, unknown>,
    publication: ReturnType<typeof productPublication>,
  ) {
    return {
      where: {
        ...where,
        publishedAt: { $notNull: true },
        ...(publication.localized ? { locale: publication.locale } : {}),
      },
      select: [
        "id",
        "documentId",
        "slug",
        "netWeight",
        "publishedAt",
        ...(publication.localized ? ["locale"] : []),
      ],
    };
  }

  function assertAuthoritativeProductRows(
    rows: any[],
    slugs: string[],
    publication: ReturnType<typeof productPublication>,
  ) {
    if (!Array.isArray(rows) || rows.length !== slugs.length) {
      throw new Error("Authoritative published shipping product is missing or ambiguous.");
    }
    const expected = new Set(slugs);
    const seenSlugs = new Set<string>();
    const seenRows = new Set<string>();
    for (const row of rows) {
      const slug = text(row?.slug);
      const rowId = Number.isSafeInteger(row?.id) && row.id > 0
        ? String(row.id)
        : text(row?.id);
      const documentId = text(row?.documentId);
      const publishedAt = new Date(row?.publishedAt);
      if (!expected.has(slug) ||
          seenSlugs.has(slug) ||
          !rowId ||
          seenRows.has(rowId) ||
          !documentId ||
          !Number.isFinite(publishedAt.getTime()) ||
          (publication.localized && text(row?.locale) !== publication.locale)) {
        throw new Error("Authoritative published shipping product is missing or ambiguous.");
      }
      seenSlugs.add(slug);
      seenRows.add(rowId);
    }
    return rows;
  }

  async function productsFor(items: unknown, trx?: any) {
    const slugs = requestedSlugs(items);
    if (!slugs.length) return [];
    const publication = productPublication();
    const products = assertAuthoritativeProductRows(
      await productQuery().findMany(withTransaction(
        trx,
        productQueryShape({ slug: { $in: slugs } }, publication),
      )),
      slugs,
      publication,
    );
    if (!trx) return products;
    const rowIds = products
      .map((product: any) => product.id)
      .sort((left: unknown, right: unknown) =>
        String(left).localeCompare(String(right)));
    for (const rowId of rowIds) {
      await strapi.db.connection("products")
        .where({ id: rowId })
        .transacting(trx)
        .forUpdate()
        .first();
    }
    const locked = assertAuthoritativeProductRows(
      await productQuery().findMany(withTransaction(
        trx,
        productQueryShape({ id: { $in: rowIds } }, publication),
      )),
      slugs,
      publication,
    );
    const before = new Map(products.map((product: any) => [
      String(product.id),
      {
        documentId: text(product.documentId),
        slug: text(product.slug),
        locale: publication.localized ? text(product.locale) : null,
        publishedAt: new Date(product.publishedAt).toISOString(),
      },
    ]));
    for (const product of locked) {
      const identity = before.get(String(product.id));
      if (!identity ||
          identity.documentId !== text(product.documentId) ||
          identity.slug !== text(product.slug) ||
          identity.locale !==
            (publication.localized ? text(product.locale) : null) ||
          identity.publishedAt !== new Date(product.publishedAt).toISOString()) {
        throw new Error("Authoritative published shipping product changed.");
      }
    }
    return locked;
  }

  async function lockByDocumentId(
    uid: string,
    table: string,
    documentId: string,
    trx: any,
  ) {
    await strapi.db.connection(table)
      .where({ document_id: documentId })
      .transacting(trx)
      .forUpdate()
      .first();
    return strapi.db.query(uid).findOne(withTransaction(trx, {
      where: { documentId },
    }));
  }

  async function validateLockedSubject(input: {
    order: any;
    checkout?: any;
    now?: Date;
    trx?: any;
  }) {
    enabled();
    const subject = input.checkout ?? input.order;
    const shipping = subject?.shippingSnapshot;
    const quote = shipping?.quote;
    if (!quote) throw new Error("Authoritative shipping snapshot is required.");
    const products = await productsFor(subject.items, input.trx);
    validateSnapshot({
      snapshot: quote,
      address: shipping.shippingAddress,
      items: subject.items,
      products,
    }, {
      secret: quoteSecret(),
      now: input.now ?? new Date(),
    });
    if (input.checkout) {
      if (input.checkout.currency !== "RON" ||
          input.checkout.totals?.shippingMinor !== quote.amountMinor ||
          input.checkout.totals?.totalMinor !== quote.amountMinor) {
        throw new Error("Shipping checkout aggregate binding changed.");
      }
      return quote;
    }
    const order = input.order;
    const rate = parseRate(order.priceSnapshot?.rate);
    const totals = authoritativeRonTotals({
      subtotalEurMinor: order.subtotalCents,
      discountEurMinor: order.discountCents,
      shippingRonMinor: quote.amountMinor,
      rate,
    });
    const expectedReference = totals.referenceTotalEurMinor;
    const expectedCharge = totals.chargeTotalRonMinor;
    if (!Number.isSafeInteger(expectedReference) ||
        !Number.isSafeInteger(expectedCharge) ||
        order.currency?.toUpperCase() !== "EUR" ||
        order.carrier !== quote.carrier ||
        !isDeepStrictEqual(order.shippingAddress, shipping.shippingAddress) ||
        (order.shippingAddressText ?? "") !==
          (shipping.shippingAddressText ?? "") ||
        order.shippingCents !== totals.shippingEurMinor ||
        order.totalCents !== expectedReference ||
        order.priceSnapshot?.reference?.amountMinor !== expectedReference ||
        order.priceSnapshot?.reference?.currency !== "EUR" ||
        order.priceSnapshot?.charge?.amountMinor !== expectedCharge ||
        order.priceSnapshot?.charge?.currency !== "RON" ||
        !isDeepStrictEqual(order.priceSnapshot?.shipping, quote) ||
        (order.shippingSnapshot?.estimatedDelivery !== undefined &&
         !isDeepStrictEqual(order.shippingSnapshot.estimatedDelivery, quote.estimate))) {
      throw new Error("Shipping order aggregate binding changed.");
    }
    return quote;
  }

  return {
    async quoteShipping(input: any) {
      enabled();
      if (input.subjectType === "membership_checkout" &&
          !input.customerDocumentId) {
        throw new Error("Shipping subject not found.");
      }
      const products = await productsFor(input.items);
      const now = input.now ?? new Date();
      const reservationExpiry = input.reservationExpiresAt
        ? new Date(input.reservationExpiresAt)
        : undefined;
      const ttlMs = reservationExpiry
        ? Math.min(
            15 * 60 * 1000,
            reservationExpiry.getTime() - new Date(now).getTime(),
          )
        : undefined;
      return createQuotes({
        address: input.address,
        items: input.items,
        products,
      }, {
        secret: quoteSecret(),
        now,
        ...(ttlMs !== undefined ? { ttlMs } : {}),
      });
    },

    async validateSelection(input: any) {
      enabled();
      const products = await productsFor(input.items, input.trx);
      return selectQuote({
        selection: input.selection,
        address: input.address,
        items: input.items,
        products,
        existingSnapshot: input.existingSnapshot,
      }, {
        secret: quoteSecret(),
        now: input.now ?? new Date(),
      });
    },

    async selectShippingQuote(input: any) {
      enabled();
      if (!["order", "membership_checkout"].includes(input.subjectType)) {
        throw new TypeError("Shipping subjectType is invalid.");
      }
      const subjectId = text(input.subjectId);
      if (!subjectId) throw new TypeError("Shipping subjectId is required.");
      return strapi.db.transaction(async ({ trx }: { trx: any }) => {
        const membership = input.subjectType === "membership_checkout";
        const uid = membership ? CHECKOUT_UID : ORDER_UID;
        const table = membership ? "membership_checkouts" : "orders";
        let subject;
        if (membership) {
          const candidate = await strapi.db.query(uid).findOne(withTransaction(trx, {
            where: { checkoutReference: subjectId },
          }));
          if (candidate) {
            subject = await lockByDocumentId(uid, table, candidate.documentId, trx);
          }
        } else {
          subject = await lockByDocumentId(uid, table, subjectId, trx);
        }
        if (!subject || !["pending", "reserved"].includes(subject.status)) {
          throw new Error("Shipping subject not found.");
        }
        assertShippingSubjectOwner(subject, input, input.subjectType);
        const products = await productsFor(subject.items, trx);
        const selected = selectQuote({
          selection: input.selection,
          address: subject.shippingAddress ??
            subject.shippingSnapshot?.shippingAddress ??
            input.address,
          items: subject.items,
          products,
          existingSnapshot: subject.shippingSnapshot?.quote,
        }, {
          secret: quoteSecret(),
          now: input.now ?? new Date(),
        });
        if (selected.idempotent) return selected;
        const shippingSnapshot = {
          ...(subject.shippingSnapshot ?? {}),
          shippingAddress: subject.shippingAddress ?? input.address,
          quote: selected.snapshot,
          estimatedDelivery: selected.snapshot.estimate,
        };
        if (membership) {
          await strapi.db.query(uid).update(withTransaction(trx, {
            where: { documentId: subject.documentId },
            data: {
              currency: "RON",
              totals: {
                ...subject.totals,
                shippingMinor: selected.snapshot.amountMinor,
                totalMinor: selected.snapshot.amountMinor,
              },
              shippingSnapshot,
            },
          }));
        } else {
          const rate = parseRate(subject.priceSnapshot?.rate);
          const totals = authoritativeRonTotals({
            subtotalEurMinor: subject.subtotalCents,
            discountEurMinor: subject.discountCents,
            shippingRonMinor: selected.snapshot.amountMinor,
            rate,
          });
          const shippingCents = totals.shippingEurMinor;
          const totalCents = totals.referenceTotalEurMinor;
          const chargeMinor = totals.chargeTotalRonMinor;
          await strapi.db.query(uid).update(withTransaction(trx, {
            where: { documentId: subject.documentId },
            data: {
              carrier: selected.snapshot.carrier,
              shippingCents,
              totalCents,
              shippingSnapshot,
              priceSnapshot: {
                ...(subject.priceSnapshot ?? {}),
                reference: { amountMinor: totalCents, currency: "EUR" },
                charge: { amountMinor: chargeMinor, currency: "RON" },
                rate: rate.rate,
                source: subject.priceSnapshot?.source || "demo-config",
                capturedAt: subject.priceSnapshot?.capturedAt || new Date().toISOString(),
                shipping: selected.snapshot,
              },
            },
          }));
        }
        return selected;
      });
    },

    validateLockedSubject,
  };
};
