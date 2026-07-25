import type { MockOrder, MockOrderStatus } from "@/lib/mock-orders";
import { normalizeOrderTimeline } from "@/lib/order-timeline.cjs";
import {
  trackingFields,
  trackingTimeline,
  type SafeShipmentProjection,
} from "@/lib/order-tracking-policy.cjs";

interface StrapiTrackedOrder {
  documentId?: string;
  id?: string | number;
  orderNumber?: string;
  trackingNumber?: string;
  carrier?: string;
  customerName?: string;
  email?: string;
  status?: string;
  currency?: string;
  totalCents?: number;
  subtotalCents?: number;
  shippingCents?: number;
  discountCents?: number;
  promotionCode?: string;
  items?: MockOrder["items"];
  statusHistory?: MockOrder["statusHistory"];
  batchAllocations?: MockOrder["batchAllocations"];
  itemsSummary?: string;
  shippingAddress?: { address?: string } | Record<string, unknown>;
  shippingAddressText?: string;
  estimatedDelivery?: string;
  createdAt?: string;
  shipment?: SafeShipmentProjection;
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
  const tracking = trackingFields(order);
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
    trackingNumber: tracking.trackingNumber,
    carrier: tracking.carrier,
    service: tracking.service,
    shipmentStatus: tracking.shipmentStatus,
    status: isStatus(String(order.status).toLowerCase())
      ? (String(order.status).toLowerCase() as MockOrderStatus)
      : "pending",
    currency: String(order.currency).toUpperCase() === "RON" ? "RON" : "EUR",
    customer: {
      name: order.customerName ?? "",
      email: order.email ?? "",
      address,
    },
    items: parsedItems,
    batchAllocations: Array.isArray(order.batchAllocations)
      ? order.batchAllocations
      : [],
    subtotalCents: order.subtotalCents ?? order.totalCents ?? 0,
    shippingCents: order.shippingCents ?? 0,
    discountCents: order.discountCents ?? 0,
    promotionCode: order.promotionCode,
    totalCents: order.totalCents ?? 0,
    createdAt: order.createdAt ?? new Date().toISOString(),
    estimatedDelivery: order.estimatedDelivery ?? new Date().toISOString(),
    emailConfirmationSent: true,
    statusHistory: trackingTimeline({
      statusHistory: normalizeOrderTimeline(order.statusHistory, order.createdAt),
      shipment: order.shipment,
    }),
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
