type UnknownRecord = Record<string, any>;
type CheckoutProduct = {
  documentId?: string;
  slug?: string;
  sku?: string;
  name?: string;
  priceCents?: number;
};

const STRUCTURED_KEYS = [
  "recipient", "locality", "postalCode", "street", "building", "countryCode",
];
const ADDRESS_FIELDS = [
  "recipient", "phone", "subdivisionCode", "locality", "postalCode",
  "street", "building", "unit", "instructions",
];
const FREE_SHIPPING_CENTS = 5000;
const GUEST_SHIPPING_CENTS = 495;
const DEFAULT_DEMO_EUR_RON_RATE = "4.975000";

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isStructuredAddress(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object"
    && STRUCTURED_KEYS.some((field) => Object.prototype.hasOwnProperty.call(value, field)));
}

function normalizeAddress(value: UnknownRecord) {
  const address: Record<string, string> = {
    countryCode: string(value.countryCode, "RO").trim().toUpperCase(),
  };
  for (const field of ADDRESS_FIELDS) address[field] = string(value[field]).trim();
  const errors = [];
  if (!address.recipient) errors.push("recipient");
  if (address.countryCode !== "RO") errors.push("countryCode");
  if (!address.locality) errors.push("locality");
  if (!/^\d{6}$/.test(address.postalCode)) errors.push("postalCode");
  if (!address.street) errors.push("street");
  if (!address.building) errors.push("building");
  if (errors.length) throw new TypeError(`Invalid shipping address: ${errors.join(", ")}`);
  return address;
}

function formatAddress(address: Record<string, string>) {
  const unit = address.unit ? `, ap. ${address.unit}` : "";
  const county = address.subdivisionCode ? `, ${address.subdivisionCode}` : "";
  const phone = address.phone ? `\nTelefon: ${address.phone}` : "";
  const instructions = address.instructions ? `\nInstrucțiuni: ${address.instructions}` : "";
  return `${address.recipient}\n${address.street} ${address.building}${unit}\n${address.postalCode} ${address.locality}${county}\nRomania${phone}${instructions}`;
}

function normalizeShippingAddressPayload(value: unknown, customerAddress: unknown) {
  if (isStructuredAddress(value)) {
    const shippingAddress = normalizeAddress(value);
    return { shippingAddress, shippingAddressText: formatAddress(shippingAddress) };
  }
  return {
    shippingAddress: undefined,
    shippingAddressText: legacyShippingAddressText(value, customerAddress),
  };
}

function legacyShippingAddressText(value: unknown, customerAddress: unknown) {
  const fallback = value && typeof value === "object"
    ? (value as UnknownRecord).address
    : undefined;
  return string(customerAddress, string(fallback));
}

function legacyNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function computeLegacyPricing(body: UnknownRecord, discountCents: number) {
  const items = (Array.isArray(body.items) ? body.items : []).map((item: UnknownRecord) => {
    const qty = Math.max(0, Math.round(legacyNumber(item?.qty)));
    const unitPriceCents = Math.max(0, Math.round(legacyNumber(item?.unitPriceCents)));
    return {
      productId: string(item?.productId),
      sku: string(item?.sku),
      slug: string(item?.slug),
      name: string(item?.name, "Product"),
      qty,
      unitPriceCents,
      lineTotalCents: Math.max(
        0,
        Math.round(legacyNumber(item?.lineTotalCents, qty * unitPriceCents)),
      ),
    };
  }).filter((item) => item.qty > 0);
  const subtotalCents = Math.max(0, legacyNumber(body.subtotalCents));
  const shippingCents = Math.max(0, legacyNumber(body.shippingCents));
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);
  return {
    items,
    subtotalCents,
    shippingCents,
    discountCents,
    totalCents,
    shippingAddress: undefined,
    anonymousSessionId: undefined,
    priceSnapshot: undefined,
  };
}

function requireClientMoney(body: UnknownRecord, field: string) {
  if (body[field] === undefined) return;
  if (!Number.isSafeInteger(body[field]) || body[field] < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
}

function computeAuthoritativePricing({
  body,
  products,
  discountCents,
}: {
  body: UnknownRecord;
  products: CheckoutProduct[];
  discountCents: number;
}) {
  for (const field of ["subtotalCents", "shippingCents", "discountCents"]) {
    requireClientMoney(body, field);
  }
  if (!Number.isSafeInteger(discountCents) || discountCents < 0) {
    throw new TypeError("discountCents must be a non-negative safe integer");
  }
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw new TypeError("Cart is empty");
  const items = rawItems.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new TypeError("Invalid item");
    const rawItem = item as UnknownRecord;
    for (const field of ["unitPriceCents", "lineTotalCents"]) requireClientMoney(rawItem, field);
    if (!Number.isSafeInteger(rawItem.qty) || rawItem.qty <= 0) {
      throw new TypeError("qty must be a positive safe integer");
    }
    const product = productBySlug.get(string(rawItem.slug));
    if (!product) throw new TypeError(`Unknown product: ${string(rawItem.slug)}`);
    if (!Number.isSafeInteger(product.priceCents) || product.priceCents < 0) {
      throw new TypeError(`Invalid authoritative price: ${product.slug}`);
    }
    const lineTotalCents = product.priceCents * rawItem.qty;
    if (!Number.isSafeInteger(lineTotalCents)) throw new RangeError("Line total exceeds safe integer range");
    return {
      productId: product.documentId,
      slug: product.slug,
      sku: product.sku ?? "",
      name: product.name ?? product.slug,
      qty: rawItem.qty,
      unitPriceCents: product.priceCents,
      lineTotalCents,
    };
  });
  const subtotalCents = items.reduce((sum, item) => {
    const next = sum + item.lineTotalCents;
    if (!Number.isSafeInteger(next)) throw new RangeError("Subtotal exceeds safe integer range");
    return next;
  }, 0);
  const shippingCents = subtotalCents >= FREE_SHIPPING_CENTS ? 0 : GUEST_SHIPPING_CENTS;
  const safeDiscount = Math.min(discountCents, subtotalCents);
  const totalCents = subtotalCents - safeDiscount + shippingCents;
  return { items, subtotalCents, shippingCents, discountCents: safeDiscount, totalCents };
}

function computePaymentOrderPricing({
  body,
  products,
  discountCents,
  pendingPayment,
  structuredCheckoutEnabled,
}: {
  body: UnknownRecord;
  products: CheckoutProduct[];
  discountCents: number;
  pendingPayment: boolean;
  structuredCheckoutEnabled: boolean;
}) {
  return pendingPayment || structuredCheckoutEnabled
    ? computeAuthoritativePricing({ body, products, discountCents })
    : computeLegacyPricing(body, discountCents);
}

function createDemoPriceSnapshot(
  eurMinor: number,
  options: { rate?: string; capturedAt?: string } = {},
) {
  if (!Number.isSafeInteger(eurMinor) || eurMinor < 0) {
    throw new TypeError("EUR minor amount must be a non-negative safe integer");
  }
  const rate = string(options.rate, process.env.DEMO_EUR_RON_RATE ?? DEFAULT_DEMO_EUR_RON_RATE);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!match) throw new TypeError("DEMO_EUR_RON_RATE must be a positive decimal");
  const decimals = match[2] ?? "";
  const denominator = BigInt(10) ** BigInt(decimals.length);
  const numerator = BigInt(match[1]) * denominator + BigInt(decimals || "0");
  if (numerator <= BigInt(0)) throw new TypeError("DEMO_EUR_RON_RATE must be positive");
  const ronMinor = Number(
    (BigInt(eurMinor) * numerator + denominator / BigInt(2)) / denominator,
  );
  if (!Number.isSafeInteger(ronMinor)) throw new RangeError("RON amount exceeds safe integer range");
  return {
    reference: { amountMinor: eurMinor, currency: "EUR" },
    charge: { amountMinor: ronMinor, currency: "RON" },
    rate,
    source: "demo-config",
    capturedAt: options.capturedAt ?? new Date().toISOString(),
  };
}

export {
  computeLegacyPricing,
  computeAuthoritativePricing,
  computePaymentOrderPricing,
  createDemoPriceSnapshot,
  legacyShippingAddressText,
  normalizeShippingAddressPayload,
};
