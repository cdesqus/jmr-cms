import type { CartItem } from "@/components/cart-context";
import type { StructuredAddress } from "@/lib/commerce/address.cjs";
import type { FxSnapshot } from "@/lib/commerce/money.cjs";

export type MockOrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "fulfilled"
  | "failed"
  | "refunded";

export type ShipmentTrackingStatus =
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "returned";

export interface MockOrder {
  id: string;
  orderNumber: string;
  trackingNumber: string;
  carrier: string;
  service?: string;
  shipmentStatus?: ShipmentTrackingStatus;
  currency: "EUR" | "RON";
  status: MockOrderStatus;
  customer: {
    name: string;
    email: string;
    address: string;
  };
  anonymousSessionId?: string;
  shippingAddress?: StructuredAddress;
  priceSnapshot?: FxSnapshot | Record<string, unknown>;
  items: {
    productId: string;
    sku?: string;
    slug: string;
    name: string;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
  batchAllocations?: {
    productDocumentId?: string;
    slug: string;
    sku?: string;
    name: string;
    batchDocumentId?: string | null;
    batchNumber: string;
    productionDate?: string;
    expiryDate?: string;
    qty: number;
  }[];
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  promotionCode?: string;
  reservationToken?: string;
  totalCents: number;
  createdAt: string;
  estimatedDelivery: string;
  shippingEstimate?: { minimumDays: number; maximumDays: number };
  emailConfirmationSent: boolean;
  statusHistory?: {
    id: string;
    type: "status" | "note";
    status?: MockOrderStatus;
    note?: string;
    actor?: string;
    createdAt: string;
  }[];
}

const ORDERS_KEY = "jamora.mock-orders.v1";
const LAST_ORDER_KEY = "jamora.last-order-id.v1";

export function createMockOrder(input: {
  items: CartItem[];
  subtotalCents: number;
  shippingCents: number;
  discountCents?: number;
  promotionCode?: string;
  reservationToken?: string;
  customer: MockOrder["customer"];
  anonymousSessionId?: string;
  shippingAddress?: StructuredAddress;
  priceSnapshot?: FxSnapshot;
}): MockOrder {
  const now = new Date();
  const id = crypto.randomUUID();
  const suffix = Math.floor(100000 + Math.random() * 900000).toString();
  const delivery = new Date(now);
  delivery.setDate(delivery.getDate() + 4);

  return {
    id,
    orderNumber: `JMR-${now.getFullYear()}-${suffix}`,
    trackingNumber: `JM${suffix}EU`,
    carrier: "Jamora EU Fulfilment",
    currency: "EUR",
    status: "paid",
    customer: input.customer,
    anonymousSessionId: input.anonymousSessionId,
    shippingAddress: input.shippingAddress,
    priceSnapshot: input.priceSnapshot,
    items: input.items.map((item) => ({
      productId: item.product.id,
      sku: item.product.sku,
      slug: item.product.slug,
      name: item.product.name,
      qty: item.qty,
      unitPriceCents: item.product.priceCents,
      lineTotalCents: item.lineTotalCents,
    })),
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    discountCents: input.discountCents ?? 0,
    promotionCode: input.promotionCode,
    reservationToken: input.reservationToken,
    totalCents: Math.max(
      0,
      input.subtotalCents - (input.discountCents ?? 0) + input.shippingCents,
    ),
    createdAt: now.toISOString(),
    estimatedDelivery: delivery.toISOString(),
    emailConfirmationSent: true,
    statusHistory: [
      {
        id: `evt-${id}`,
        type: "status",
        status: "paid",
        note: "Payment confirmed in test mode.",
        actor: "Checkout",
        createdAt: now.toISOString(),
      },
    ],
  };
}

export function saveMockOrder(order: MockOrder) {
  const orders = getMockOrders();
  localStorage.setItem(ORDERS_KEY, JSON.stringify([order, ...orders]));
  localStorage.setItem(LAST_ORDER_KEY, order.id);
}

export async function syncMockOrderToStrapi(order: MockOrder) {
  try {
    const response = await fetch("/api/jamora/orders/mock-paid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(order),
    });
    const json = await response.json().catch(() => ({}));
    return response.ok
      ? {
          ok: true as const,
          order: authoritativeMockOrder(json.order),
        }
      : { ok: false as const, error: json.error ?? "Order could not be created." };
  } catch {
    return { ok: false as const, error: "Order service is unavailable." };
  }
}

function integer(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Invalid authoritative ${label}.`);
  }
  return Number(value);
}

function checkoutStatus(value: unknown): MockOrderStatus {
  return [
    "pending", "paid", "processing", "shipped", "fulfilled", "failed",
    "refunded",
  ].includes(String(value))
    ? value as MockOrderStatus
    : "pending";
}

export function authoritativeMockOrder(value: unknown): MockOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Authoritative order is unavailable.");
  }
  const order = value as Record<string, unknown>;
  const customer = order.customer && typeof order.customer === "object"
    ? order.customer as Record<string, unknown>
    : {};
  const currency = order.currency === "RON" ? "RON" : "EUR";
  const createdAt = typeof order.createdAt === "string"
    ? order.createdAt
    : new Date().toISOString();
  const shippingEstimate = order.shippingEstimate &&
    typeof order.shippingEstimate === "object"
    ? order.shippingEstimate as { minimumDays?: unknown; maximumDays?: unknown }
    : undefined;
  const maximumDays = shippingEstimate
    ? integer(shippingEstimate.maximumDays, "delivery estimate")
    : 4;
  const estimated = new Date(createdAt);
  estimated.setUTCDate(estimated.getUTCDate() + maximumDays);
  const items = (Array.isArray(order.items) ? order.items : []).map((item) => {
    const source = item && typeof item === "object"
      ? item as Record<string, unknown>
      : {};
    return {
      productId: String(source.productId ?? ""),
      sku: typeof source.sku === "string" ? source.sku : undefined,
      slug: String(source.slug ?? ""),
      name: String(source.name ?? ""),
      qty: integer(source.qty, "item quantity"),
      unitPriceCents: integer(source.unitPriceCents, "item price"),
      lineTotalCents: integer(source.lineTotalCents, "item total"),
    };
  });
  return {
    id: String(order.id ?? order.orderNumber ?? ""),
    orderNumber: String(order.orderNumber ?? ""),
    trackingNumber: String(order.trackingNumber ?? ""),
    carrier: String(order.carrier ?? "Jamora EU Fulfilment"),
    ...(typeof order.service === "string" ? { service: order.service } : {}),
    currency,
    status: checkoutStatus(order.status),
    customer: {
      name: String(customer.name ?? ""),
      email: String(customer.email ?? ""),
      address: String(customer.address ?? ""),
    },
    ...(order.shippingAddress && typeof order.shippingAddress === "object"
      ? { shippingAddress: order.shippingAddress as StructuredAddress }
      : {}),
    ...(order.priceSnapshot && typeof order.priceSnapshot === "object"
      ? { priceSnapshot: order.priceSnapshot as Record<string, unknown> }
      : {}),
    items,
    subtotalCents: integer(order.subtotalCents, "subtotal"),
    shippingCents: integer(order.shippingCents, "shipping"),
    discountCents: integer(order.discountCents, "discount"),
    ...(typeof order.promotionCode === "string"
      ? { promotionCode: order.promotionCode }
      : {}),
    totalCents: integer(order.totalCents, "total"),
    createdAt,
    estimatedDelivery: typeof order.estimatedDelivery === "string"
      ? order.estimatedDelivery
      : estimated.toISOString(),
    ...(shippingEstimate
      ? {
          shippingEstimate: {
            minimumDays: integer(
              shippingEstimate.minimumDays,
              "delivery estimate",
            ),
            maximumDays,
          },
        }
      : {}),
    emailConfirmationSent: true,
    statusHistory: [{
      id: `evt-${String(order.id ?? order.orderNumber ?? "order")}`,
      type: "status",
      status: checkoutStatus(order.status),
      note: "Order confirmed by the checkout server.",
      actor: "Checkout",
      createdAt,
    }],
  };
}

export function getMockOrders(): MockOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as MockOrder[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getMockOrder(idOrNumber: string | null): MockOrder | null {
  if (!idOrNumber) return null;
  return (
    getMockOrders().find(
      (order) =>
        order.id === idOrNumber ||
        order.orderNumber.toLowerCase() === idOrNumber.toLowerCase() ||
        order.trackingNumber.toLowerCase() === idOrNumber.toLowerCase(),
    ) ?? null
  );
}

export function getLastMockOrder(): MockOrder | null {
  return getMockOrder(localStorage.getItem(LAST_ORDER_KEY));
}
