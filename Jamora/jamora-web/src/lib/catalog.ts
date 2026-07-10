import {
  PRODUCTS as MOCK_PRODUCTS,
  type Category,
  type Certification,
  type Product,
} from "@/lib/products";

// Server-side catalog data layer. Products are read from Strapi when available,
// with the bundled catalog as a graceful fallback for local/dev downtime.

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

const CERT_ORDER: Certification[] = [
  "Organic",
  "Vegan",
  "EU Compliant",
  "GMP",
  "Non-GMO",
];

interface StrapiProductFields {
  documentId?: string;
  id?: number | string;
  slug?: string;
  name?: string;
  botanical?: string;
  category?: string;
  priceCents?: number;
  tagline?: string;
  description?: string;
  ingredients?: unknown;
  allergens?: unknown;
  benefits?: unknown;
  howToUse?: string;
  certifications?: unknown;
  netWeight?: string;
  featured?: boolean;
  stock?: number;
  gradient?: unknown;
}

type StrapiEntity<T extends object> = T & {
  id?: number | string;
  documentId?: string;
  attributes?: T;
};

function isCategory(v: unknown): v is Category {
  return v === "energy" || v === "digestion" || v === "balance";
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toCertifications(value: unknown): Certification[] {
  return toStringList(value).filter((cert): cert is Certification =>
    CERT_ORDER.includes(cert as Certification),
  );
}

function toGradient(value: unknown): [string, string] {
  const colors = toStringList(value);
  return [colors[0] ?? "#c25a2b", colors[1] ?? "#9f461f"];
}

function mapProduct(entity: StrapiEntity<StrapiProductFields>): Product | null {
  const fields = entity.attributes ?? entity;
  if (!fields.slug || !fields.name || !isCategory(fields.category)) return null;

  return {
    id: String(fields.documentId ?? fields.id ?? entity.documentId ?? entity.id ?? fields.slug),
    slug: fields.slug,
    name: fields.name,
    botanical: fields.botanical ?? "",
    category: fields.category,
    priceCents: fields.priceCents ?? 0,
    tagline: fields.tagline ?? "",
    description: fields.description ?? "",
    ingredients: toStringList(fields.ingredients),
    allergens: toStringList(fields.allergens),
    benefits: toStringList(fields.benefits),
    howToUse: fields.howToUse ?? "",
    certifications: toCertifications(fields.certifications),
    netWeight: fields.netWeight ?? "",
    featured: fields.featured ?? false,
    stock: fields.stock ?? 0,
    gradient: toGradient(fields.gradient),
  };
}

async function strapiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${STRAPI_URL}${path}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Strapi ${path} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getAllProducts(): Promise<Product[]> {
  try {
    const { data } = await strapiFetch<{
      data: StrapiEntity<StrapiProductFields>[];
    }>("/api/products?pagination[pageSize]=100&sort=slug:asc");
    const mapped = data.map(mapProduct).filter((p): p is Product => p !== null);
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
  const featured = products.filter((p) => p.featured);
  return (featured.length > 0 ? featured : products).slice(0, limit);
}
