import { formatEUR } from "@/lib/products";
import type { Product } from "@/lib/products";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export type AdminOrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "fulfilled"
  | "failed"
  | "refunded";

export interface AdminOrder {
  documentId: string;
  orderNumber?: string;
  trackingNumber?: string;
  carrier?: string;
  customerName?: string;
  email?: string;
  status: AdminOrderStatus;
  currency?: string;
  totalCents?: number;
  estimatedProfitCents?: number;
  itemsSummary?: string;
  shippingAddressText?: string;
  trackingPreviewUrl?: string;
  deliveryLabelUrl?: string;
  estimatedDelivery?: string;
  createdAt?: string;
}

export interface AdminProduct {
  documentId: string;
  slug: string;
  name: string;
  botanical?: string;
  category: "energy" | "digestion" | "balance";
  priceCents: number;
  tagline?: string;
  description?: string;
  ingredients?: string[];
  allergens?: string[];
  benefits?: string[];
  howToUse?: string;
  certifications?: string[];
  netWeight?: string;
  featured?: boolean;
  gradient?: string[];
  stock?: number;
  publishedAt?: string;
  updatedAt?: string;
}

export interface AnalyticsSummary {
  visits: number;
  visitsToday: number;
  sales: number;
  revenueCents: number;
  todayRevenueCents: number;
  estimatedProfitCents: number;
  estimatedMargin: number;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${STRAPI_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Admin API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getAdminOrders() {
  const { orders } = await adminFetch<{ orders: AdminOrder[] }>(
    "/api/jamora/admin/orders",
  );
  return orders;
}

export async function getAdminProducts() {
  const { products } = await adminFetch<{ products: AdminProduct[] }>(
    "/api/jamora/admin/products",
  );
  return products;
}

export async function getAnalyticsSummary() {
  return adminFetch<AnalyticsSummary>("/api/jamora/analytics/summary");
}

export function formatAdminMoney(cents = 0) {
  return formatEUR(cents);
}

export function parseOrderItems(itemsSummary?: string) {
  if (!itemsSummary) return [];
  try {
    const parsed = JSON.parse(itemsSummary) as {
      name?: string;
      qty?: number;
      lineTotalCents?: number;
    }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function adminProductToProduct(product: AdminProduct): Product {
  return {
    id: product.documentId,
    slug: product.slug,
    name: product.name,
    botanical: product.botanical ?? "",
    category: product.category,
    priceCents: product.priceCents,
    tagline: product.tagline ?? "",
    description: product.description ?? "",
    ingredients: product.ingredients ?? [],
    allergens: product.allergens ?? [],
    benefits: product.benefits ?? [],
    howToUse: product.howToUse ?? "",
    certifications: [],
    netWeight: product.netWeight ?? "",
    featured: product.featured,
    stock: product.stock,
    gradient: [
      product.gradient?.[0] ?? "#c25a2b",
      product.gradient?.[1] ?? "#9f461f",
    ],
  };
}
