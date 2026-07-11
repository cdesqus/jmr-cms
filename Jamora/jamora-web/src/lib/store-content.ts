import type { StoreContent } from "@/lib/admin-api";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export const DEFAULT_STORE_CONTENT: Required<
  Omit<StoreContent, "documentId" | "updatedAt">
> = {
  heroEyebrow: "Energi · Digestie · Echlibru",
  heroTitle: "100% Made in Indonesia,",
  heroHighlight: "standardised for Europe.",
  heroDescription:
    "Premium jamu - Indonesia's living herbal tradition - refined to European standards of purity, transparency, and taste.",
  primaryCtaLabel: "Explore the collection",
  secondaryCtaLabel: "Our story",
  pillarsEyebrow: "Three pillars",
  pillarsTitle: "One tradition, three ways to feel well.",
  featuredEyebrow: "Best sellers",
  featuredTitle: "Loved across Europe",
  storyEyebrow: "From root to cup",
  storyTitle: "Traceable botanicals, standardised potency.",
  storyDescription:
    "Every batch is single-origin, lab-verified for active compounds, and documented from the Javanese highlands to your kitchen.",
  certifications: ["Organic", "Vegan", "EU Compliant", "GMP", "Non-GMO"],
};

export function mergeStoreContent(content?: StoreContent | null) {
  return {
    ...DEFAULT_STORE_CONTENT,
    ...(content ?? {}),
    certifications:
      content?.certifications?.length
        ? content.certifications
        : DEFAULT_STORE_CONTENT.certifications,
  };
}

export async function getPublicStoreContent() {
  try {
    const res = await fetch(`${STRAPI_URL}/api/jamora/content`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("Content fetch failed");
    const json = (await res.json()) as { content?: StoreContent | null };
    return mergeStoreContent(json.content);
  } catch {
    return DEFAULT_STORE_CONTENT;
  }
}
