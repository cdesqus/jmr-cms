import {
  quoteShipping as createQuotes,
  selectShippingQuote as selectQuote,
  validateShippingSnapshot as validateSnapshot,
} from "./shipping-domain.cjs";
import { isDeepStrictEqual } from "node:util";

const PRODUCT_UID = "api::product.product";
const ORDER_UID = "api::order.order";
const CHECKOUT_UID = "api::membership-checkout.membership-checkout";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function enabled() {
  if (process.env.SHIPPING_ENABLED !== "true") throw new Error("Not found.");
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
  const match = /^(\d+)(?:\.(\d+))?$/.exec(
    text(value || process.env.DEMO_EUR_RON_RATE || "4.975000"),
  );
  if (!match) throw new TypeError("DEMO_EUR_RON_RATE must be a positive decimal.");
  const decimals = match[2] ?? "";
  const denominator = BigInt(10) ** BigInt(decimals.length);
  const numerator = BigInt(match[1]) * denominator + BigInt(decimals || "0");
  if (numerator <= BigInt(0)) {
    throw new TypeError("DEMO_EUR_RON_RATE must be positive.");
  }
  return { rate: `${match[1]}.${decimals || "0"}`, numerator, denominator };
}

function convertEurToRon(eurMinor: number, rate: ReturnType<typeof parseRate>) {
  if (!Number.isSafeInteger(eurMinor) || eurMinor < 0) {
    throw new TypeError("EUR minor amount must be a non-negative safe integer.");
  }
  const result = Number(
    (BigInt(eurMinor) * rate.numerator + rate.denominator / BigInt(2)) /
      rate.denominator,
  );
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("RON amount exceeds safe integer range.");
  }
  return result;
}

function convertRonToEur(ronMinor: number, rate: ReturnType<typeof parseRate>) {
  if (!Number.isSafeInteger(ronMinor) || ronMinor < 0) {
    throw new TypeError("RON minor amount must be a non-negative safe integer.");
  }
  const result = Number(
    (BigInt(ronMinor) * rate.denominator + rate.numerator / BigInt(2)) /
      rate.numerator,
  );
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("EUR amount exceeds safe integer range.");
  }
  return result;
}

export default ({ strapi }: { strapi: any }) => {
  const productQuery = () => strapi.db.query(PRODUCT_UID);

  async function productsFor(items: unknown, trx?: any) {
    const slugs = requestedSlugs(items);
    if (!slugs.length) return [];
    const query = {
      where: { slug: { $in: slugs } },
      select: ["documentId", "slug", "netWeight"],
      limit: slugs.length,
    };
    const products = await productQuery().findMany(withTransaction(trx, query));
    if (!trx) return products;
    const documentIds = products
      .map((product: any) => text(product?.documentId))
      .filter(Boolean)
      .sort();
    for (const documentId of documentIds) {
      await strapi.db.connection("products")
        .where({ document_id: documentId })
        .transacting(trx)
        .forUpdate()
        .first();
    }
    return productQuery().findMany(withTransaction(trx, query));
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

  function assertOwner(subject: any, input: any) {
    if (input.customerDocumentId) {
      if (subject?.customerDocumentId !== input.customerDocumentId) {
        throw new Error("Shipping subject not found.");
      }
      return;
    }
    const capability = text(input.guestCheckoutCapability);
    if (!capability ||
        (subject?.reservationToken !== capability &&
         subject?.checkoutReference !== capability)) {
      throw new Error("Shipping subject not found.");
    }
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
    const merchandiseEur = order.subtotalCents - order.discountCents;
    const shippingEur = convertRonToEur(quote.amountMinor, rate);
    const expectedReference = merchandiseEur + shippingEur;
    const expectedCharge = convertEurToRon(merchandiseEur, rate) +
      quote.amountMinor;
    if (!Number.isSafeInteger(expectedReference) ||
        !Number.isSafeInteger(expectedCharge) ||
        order.currency?.toUpperCase() !== "EUR" ||
        order.carrier !== quote.carrier ||
        !isDeepStrictEqual(order.shippingAddress, shipping.shippingAddress) ||
        (order.shippingAddressText ?? "") !==
          (shipping.shippingAddressText ?? "") ||
        order.shippingCents !== shippingEur ||
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
      const products = await productsFor(input.items);
      return createQuotes({
        address: input.address,
        items: input.items,
        products,
      }, {
        secret: quoteSecret(),
        now: input.now ?? new Date(),
      });
    },

    async validateSelection(input: any) {
      enabled();
      const products = input.products ?? await productsFor(input.items, input.trx);
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
        assertOwner(subject, input);
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
          const merchandiseEur = subject.subtotalCents - subject.discountCents;
          const shippingCents = convertRonToEur(selected.snapshot.amountMinor, rate);
          const totalCents = merchandiseEur + shippingCents;
          const chargeMinor = convertEurToRon(merchandiseEur, rate) +
            selected.snapshot.amountMinor;
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
