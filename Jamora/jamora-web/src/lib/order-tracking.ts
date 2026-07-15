import type { MockOrder, MockOrderStatus } from "@/lib/mock-orders";

interface StrapiTrackedOrder {
  documentId?: string;
  id?: string | number;
  orderNumber?: string;
  trackingNumber?: string;
  carrier?: string;
  customerName?: string;
  email?: string;
  status?: string;
  totalCents?: number;
  subtotalCents?: number;
  shippingCents?: number;
  discountCents?: number;
  promotionCode?: string;
  items?: MockOrder["items"];
  statusHistory?: MockOrder["statusHistory"];
  itemsSummary?: string;
  shippingAddress?: { address?: string } | Record<string, unknown>;
  shippingAddressText?: string;
  estimatedDelivery?: string;
  createdAt?: string;
}

function isStatus(value: unknown): value is MockOrderStatus {
  return (
    value === "pending" ||
    value === "paid" ||
    value === "processing" ||
    value === "shipped" ||
    value === "fulfilled" ||
    value === "failed" ||
    value === "refunded"
  );
}

function mapTrackedOrder(order: StrapiTrackedOrder): MockOrder {
  const shippingAddress = order.shippingAddress ?? {};
  const address =
    typeof order.shippingAddressText === "string"
      ? order.shippingAddressText
      :
    typeof shippingAddress === "object" &&
    "address" in shippingAddress &&
    typeof shippingAddress.address === "string"
      ? shippingAddress.address
      : "";
  const parsedItems = (() => {
    if (Array.isArray(order.items)) return order.items;
    if (!order.itemsSummary) return [];
    try {
      const parsed = JSON.parse(order.itemsSummary) as MockOrder["items"];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  return {
    id: String(order.documentId ?? order.id ?? order.orderNumber),
    orderNumber: order.orderNumber ?? "JMR-UNKNOWN",
    trackingNumber: order.trackingNumber ?? "",
    carrier: order.carrier ?? "Jamora EU Fulfilment",
    status: isStatus(String(order.status).toLowerCase())
      ? (String(order.status).toLowerCase() as MockOrderStatus)
      : "pending",
    customer: {
      name: order.customerName ?? "",
      email: order.email ?? "",
      address,
    },
    items: parsedItems,
    subtotalCents: order.subtotalCents ?? order.totalCents ?? 0,
    shippingCents: order.shippingCents ?? 0,
    discountCents: order.discountCents ?? 0,
    promotionCode: order.promotionCode,
    totalCents: order.totalCents ?? 0,
    createdAt: order.createdAt ?? new Date().toISOString(),
    estimatedDelivery: order.estimatedDelivery ?? new Date().toISOString(),
    emailConfirmationSent: true,
    statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [],
  };
}

export async function fetchTrackedOrder(query: string): Promise<MockOrder | null> {
  const res = await fetch(
    `/api/jamora/orders/track?q=${encodeURIComponent(query)}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Order tracking failed: ${res.status}`);
  const json = (await res.json()) as { order?: StrapiTrackedOrder };
  return json.order ? mapTrackedOrder(json.order) : null;
}
