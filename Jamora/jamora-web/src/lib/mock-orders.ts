import type { CartItem } from "@/components/cart-context";

export type MockOrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "fulfilled"
  | "failed"
  | "refunded";

export interface MockOrder {
  id: string;
  orderNumber: string;
  trackingNumber: string;
  carrier: string;
  status: MockOrderStatus;
  customer: {
    name: string;
    email: string;
    address: string;
  };
  items: {
    productId: string;
    sku?: string;
    slug: string;
    name: string;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  promotionCode?: string;
  reservationToken?: string;
  totalCents: number;
  createdAt: string;
  estimatedDelivery: string;
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
    status: "paid",
    customer: input.customer,
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
      ? { ok: true as const }
      : { ok: false as const, error: json.error ?? "Order could not be created." };
  } catch {
    return { ok: false as const, error: "Order service is unavailable." };
  }
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
