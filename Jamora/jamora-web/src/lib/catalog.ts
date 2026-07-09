import {
  PRODUCTS as MOCK_PRODUCTS,
  type Category,
  type Certification,
  type Product,
} from "@/lib/products";

// Data-access layer for the storefront. When a Medusa backend is available,
// products are read live from its Store API; otherwise we gracefully fall back
// to the bundled mock catalogue so the site still works standalone.

// Read server-side only (this module is imported exclusively by Server
// Components), so these are supplied at runtime by the container — no need to
// bake the publishable key into the build. The NEXT_PUBLIC_* names are kept as
// a fallback for local `.env.local` development.
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL ??
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ??
  "http://localhost:9000";
const PUBLISHABLE_KEY =
  process.env.MEDUSA_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;

const CERT_ORDER: Certification[] = [
  "Organic",
  "Vegan",
  "EU Compliant",
  "GMP",
  "Non-GMO",
];

let publishableKeyCache: string | undefined;

function getConfiguredPublishableKey(): string | undefined {
  const key = PUBLISHABLE_KEY?.trim();
  return key ? key : undefined;
}

async function getPublishableKey(): Promise<string | null> {
  const configuredKey = getConfiguredPublishableKey();
  if (configuredKey) return configuredKey;
  if (publishableKeyCache) return publishableKeyCache;

  try {
    const res = await fetch(`${BACKEND_URL}/jamora/storefront-config`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error(`Medusa storefront config -> ${res.status}`);
    }

    const { publishableKey } = (await res.json()) as {
      publishableKey?: string | null;
    };
    const discoveredKey = publishableKey?.trim();
    if (!discoveredKey) return null;

    publishableKeyCache = discoveredKey;
  } catch {
    return null;
  }

  return publishableKeyCache;
}

async function medusaFetch<T>(path: string): Promise<T> {
  const publishableKey = await getPublishableKey();
  if (!publishableKey) {
    throw new Error("Medusa publishable key is unavailable");
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "x-publishable-api-key": publishableKey },
    // Revalidate periodically so CMS edits show up without a redeploy.
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Medusa ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface MedusaVariant {
  calculated_price?: { calculated_amount?: number };
}
interface MedusaProduct {
  id: string;
  title: string;
  handle: string;
  description?: string;
  metadata?: Record<string, string | undefined>;
  variants?: MedusaVariant[];
}

function toList(value: string | undefined, sep: string): string[] {
  if (!value) return [];
  return value
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isCategory(v: string | undefined): v is Category {
  return v === "energy" || v === "digestion" || v === "balance";
}

function mapProduct(mp: MedusaProduct): Product | null {
  const meta = mp.metadata ?? {};
  const category = meta.category;
  if (!isCategory(category)) return null; // skip non-Jamora products

  const amount = mp.variants?.[0]?.calculated_price?.calculated_amount ?? 0;
  const certifications = toList(meta.certifications, ",").filter((c) =>
    CERT_ORDER.includes(c as Certification),
  ) as Certification[];

  return {
    id: mp.id,
    slug: mp.handle,
    name: mp.title,
    botanical: meta.botanical ?? "",
    category,
    priceCents: Math.round(amount * 100),
    tagline: meta.tagline ?? "",
    description: mp.description ?? "",
    ingredients: toList(meta.ingredients, "\n"),
    allergens: toList(meta.allergens, ","),
    benefits: toList(meta.benefits, "\n"),
    howToUse: meta.how_to_use ?? "",
    certifications,
    netWeight: meta.net_weight ?? "",
    gradient: [meta.gradient_from ?? "#c25a2b", meta.gradient_to ?? "#9f461f"],
  };
}

let regionIdCache: string | null | undefined;

async function getEurRegionId(): Promise<string | null> {
  if (regionIdCache !== undefined) return regionIdCache;
  try {
    const { regions } = await medusaFetch<{
      regions: { id: string; currency_code: string }[];
    }>("/store/regions");
    const eur = regions.find((r) => r.currency_code === "eur") ?? regions[0];
    regionIdCache = eur?.id ?? null;
  } catch {
    regionIdCache = null;
  }
  return regionIdCache;
}

export async function getAllProducts(): Promise<Product[]> {
  const publishableKey = await getPublishableKey();
  if (!publishableKey) return MOCK_PRODUCTS;

  try {
    const regionId = await getEurRegionId();
    const fields =
      "id,title,handle,description,metadata,*variants,*variants.calculated_price";
    const region = regionId ? `&region_id=${regionId}` : "";
    const { products } = await medusaFetch<{ products: MedusaProduct[] }>(
      `/store/products?limit=100&fields=${fields}${region}`,
    );
    const mapped = products.map(mapProduct).filter((p): p is Product => p !== null);
    // If the backend has no Jamora products yet, fall back so the site isn't empty.
    return mapped.length > 0 ? mapped : MOCK_PRODUCTS;
  } catch {
    return MOCK_PRODUCTS;
  }
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const products = await getAllProducts();
  return products.find((p) => p.slug === slug);
}

export async function getProductsByCategory(
  category: Category,
): Promise<Product[]> {
  const products = await getAllProducts();
  return products.filter((p) => p.category === category);
}

export async function getFeaturedProducts(limit = 3): Promise<Product[]> {
  const products = await getAllProducts();
  // Prefer explicitly-featured mock products; otherwise take the first N.
  const featured = products.filter((p) => p.featured);
  return (featured.length > 0 ? featured : products).slice(0, limit);
}
