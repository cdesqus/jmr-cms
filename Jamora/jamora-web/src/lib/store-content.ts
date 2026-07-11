import type { StoreContent } from "@/lib/admin-api";
import { localized, type Locale } from "@/lib/i18n";

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
  heroEyebrowRo: "Energie · Digestie · Echilibru",
  heroTitleRo: "100% produs in Indonezia,",
  heroHighlightRo: "standardizat pentru Europa.",
  heroDescriptionRo:
    "Jamu premium - traditia vie a plantelor indoneziene - rafinat pentru standarde europene de puritate, transparenta si gust.",
  primaryCtaLabelRo: "Exploreaza colectia",
  secondaryCtaLabelRo: "Povestea noastra",
  pillarsEyebrow: "Three pillars",
  pillarsTitle: "One tradition, three ways to feel well.",
  featuredEyebrow: "Best sellers",
  featuredTitle: "Loved across Europe",
  storyEyebrow: "From root to cup",
  storyTitle: "Traceable botanicals, standardised potency.",
  storyDescription:
    "Every batch is single-origin, lab-verified for active compounds, and documented from the Javanese highlands to your kitchen.",
  pillarsEyebrowRo: "Trei directii",
  pillarsTitleRo: "O traditie, trei moduri de a te simti bine.",
  featuredEyebrowRo: "Cele mai iubite",
  featuredTitleRo: "Apreciate in Europa",
  storyEyebrowRo: "De la radacina la ceasca",
  storyTitleRo: "Plante trasabile, putere standardizata.",
  storyDescriptionRo:
    "Fiecare lot are origine unica, este verificat in laborator pentru compusi activi si documentat din zonele inalte ale Javei pana in bucataria ta.",
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

export function localizeStoreContent(content: ReturnType<typeof mergeStoreContent>, locale: Locale) {
  return {
    heroEyebrow: localized(content, locale, "heroEyebrow"),
    heroTitle: localized(content, locale, "heroTitle"),
    heroHighlight: localized(content, locale, "heroHighlight"),
    heroDescription: localized(content, locale, "heroDescription"),
    primaryCtaLabel: localized(content, locale, "primaryCtaLabel"),
    secondaryCtaLabel: localized(content, locale, "secondaryCtaLabel"),
    pillarsEyebrow: localized(content, locale, "pillarsEyebrow"),
    pillarsTitle: localized(content, locale, "pillarsTitle"),
    featuredEyebrow: localized(content, locale, "featuredEyebrow"),
    featuredTitle: localized(content, locale, "featuredTitle"),
    storyEyebrow: localized(content, locale, "storyEyebrow"),
    storyTitle: localized(content, locale, "storyTitle"),
    storyDescription: localized(content, locale, "storyDescription"),
    certifications: content.certifications,
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
