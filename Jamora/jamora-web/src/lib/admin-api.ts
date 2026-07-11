import { formatEUR } from "@/lib/products";
import type { Product } from "@/lib/products";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

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
  image?: { url?: string; alternativeText?: string; name?: string } | null;
  imageUrl?: string;
  gradient?: string[];
  stock?: number;
  minStock?: number;
  maxStock?: number;
  publishedAt?: string;
  updatedAt?: string;
}

export interface StoreContent {
  documentId?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroHighlight?: string;
  heroDescription?: string;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  heroEyebrowRo?: string;
  heroTitleRo?: string;
  heroHighlightRo?: string;
  heroDescriptionRo?: string;
  primaryCtaLabelRo?: string;
  secondaryCtaLabelRo?: string;
  pillarsEyebrow?: string;
  pillarsTitle?: string;
  featuredEyebrow?: string;
  featuredTitle?: string;
  storyEyebrow?: string;
  storyTitle?: string;
  storyDescription?: string;
  pillarsEyebrowRo?: string;
  pillarsTitleRo?: string;
  featuredEyebrowRo?: string;
  featuredTitleRo?: string;
  storyEyebrowRo?: string;
  storyTitleRo?: string;
  storyDescriptionRo?: string;
  certifications?: string[];
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
      ...(ADMIN_API_SECRET
        ? { "x-jamora-admin-secret": ADMIN_API_SECRET }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Admin API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function absoluteStrapiUrl(url?: string) {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `${STRAPI_URL}${url}`;
}

export async function getAdminOrders() {
  const { orders } = await adminFetch<{ orders: AdminOrder[] }>(
    "/api/jamora/admin/orders",
  );
  return orders;
}

export async function getAdminProducts() {
  try {
    const { products } = await adminFetch<{ products: AdminProduct[] }>(
      "/api/jamora/admin/products",
    );
    return products.map((product) => ({
      ...product,
      imageUrl: absoluteStrapiUrl(product.image?.url),
    }));
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getAnalyticsSummary() {
  return adminFetch<AnalyticsSummary>("/api/jamora/analytics/summary");
}

export async function getStoreContent() {
  const { content } = await adminFetch<{ content: StoreContent | null }>(
    "/api/jamora/content",
  );
  return content ?? {};
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
  imageUrl: product.imageUrl,
  gradient: [
      product.gradient?.[0] ?? "#c25a2b",
      product.gradient?.[1] ?? "#9f461f",
    ],
  };
}
