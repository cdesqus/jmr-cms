// Jamora product catalog — mock data for the storefront MVP.
// Prices are in EUR (the storefront's default currency).
// Categories map to the brand pillars: Energi · Digestie · Echlibru.

export type Category = "energy" | "digestion" | "balance";

export type Certification =
  | "Organic"
  | "Vegan"
  | "EU Compliant"
  | "GMP"
  | "Non-GMO";

export interface Product {
  id: string;
  slug: string;
  sku?: string;
  name: string;
  /** Botanical / Indonesian name shown as a subtitle. */
  botanical: string;
  category: Category;
  /** Price in EUR, minor units (cents) to avoid float rounding. */
  priceCents: number;
  tagline: string;
  description: string;
  /** Structured ingredient transparency (EU requirement). */
  ingredients: string[];
  /** Allergen declarations — empty array means "none declared". */
  allergens: string[];
  benefits: string[];
  howToUse: string;
  certifications: Certification[];
  netWeight: string;
  featured?: boolean;
  stock?: number;
  imageUrl?: string;
  /** Two-stop gradient used for the botanical placeholder visual. */
  gradient: [string, string];
}

export const CATEGORY_META: Record<
  Category,
  { label: string; pillar: string; blurb: string; colorVar: string }
> = {
  energy: {
    label: "Energy",
    pillar: "Energi",
    blurb:
      "Rooted tonics of turmeric and red ginger to kindle steady, clean vitality.",
    colorVar: "var(--color-energy)",
  },
  digestion: {
    label: "Digestion",
    pillar: "Digestie",
    blurb:
      "Warming aromatics that settle, soothe, and restore the gut's natural rhythm.",
    colorVar: "var(--color-digestion)",
  },
  balance: {
    label: "Balance",
    pillar: "Echlibru",
    blurb:
      "Gentle adaptogenic botanicals to bring the body back into quiet equilibrium.",
    colorVar: "var(--color-balance)",
  },
};

export const PRODUCTS: Product[] = [
  {
    id: "jm-01",
    slug: "temulawak-vitality",
    name: "Temulawak Vitality",
    botanical: "Curcuma zanthorrhiza",
    category: "energy",
    priceCents: 3200,
    tagline: "Java's golden root, standardised for steady energy.",
    description:
      "A single-origin Javanese temulawak tonic, cold-milled to preserve its curcuminoids. Where coffee spikes and crashes, Temulawak offers a slow, sustained lift — the way Indonesian herbalists have used it for centuries.",
    ingredients: [
      "Javanese temulawak (Curcuma zanthorrhiza) 92%",
      "Black pepper extract (piperine)",
      "Acacia fibre",
    ],
    allergens: [],
    benefits: [
      "Sustained daytime energy",
      "Liver & metabolic support",
      "Antioxidant curcuminoids",
    ],
    howToUse:
      "Whisk one 3 g sachet into 150 ml of warm water each morning, before food.",
    certifications: ["Organic", "Vegan", "EU Compliant", "GMP"],
    netWeight: "30 sachets · 90 g",
    featured: true,
    gradient: ["#e2913f", "#c25a2b"],
  },
  {
    id: "jm-02",
    slug: "red-ginger-ember",
    name: "Red Ginger Ember",
    botanical: "Zingiber officinale var. rubrum",
    category: "energy",
    priceCents: 2800,
    tagline: "Jahe merah — warmth that moves.",
    description:
      "Highland red ginger, hotter and more resinous than its common cousin, blended into a brisk morning infusion. A circulatory wake-up that warms from the inside out.",
    ingredients: [
      "Red ginger (Zingiber officinale var. rubrum) 88%",
      "Java cinnamon",
      "Palm sugar (low-GI)",
    ],
    allergens: [],
    benefits: [
      "Stimulates circulation",
      "Pre-movement warm-up",
      "Immune resilience",
    ],
    howToUse:
      "Steep one sachet in 200 ml just-boiled water for 4 minutes. Enjoy morning or pre-exercise.",
    certifications: ["Organic", "Vegan", "EU Compliant", "Non-GMO"],
    netWeight: "24 sachets · 96 g",
    featured: true,
    gradient: ["#d5722e", "#9f461f"],
  },
  {
    id: "jm-03",
    slug: "kencur-calm",
    name: "Kencur Calm",
    botanical: "Kaempferia galanga",
    category: "digestion",
    priceCents: 3000,
    tagline: "Aromatic ginger to settle the centre.",
    description:
      "Kencur — Indonesia's aromatic sand ginger — is the quiet backbone of jamu. This blend eases bloating and calms an unsettled stomach with a clean, camphor-bright finish.",
    ingredients: [
      "Kencur / sand ginger (Kaempferia galanga) 85%",
      "Fennel seed",
      "Tamarind",
    ],
    allergens: [],
    benefits: [
      "Eases bloating",
      "Post-meal digestive comfort",
      "Soothes nausea",
    ],
    howToUse:
      "Dissolve one sachet in 150 ml warm water after meals, up to twice daily.",
    certifications: ["Organic", "Vegan", "EU Compliant", "GMP"],
    netWeight: "30 sachets · 90 g",
    featured: true,
    gradient: ["#8aa06f", "#5b6f57"],
  },
  {
    id: "jm-04",
    slug: "beras-kencur-heritage",
    name: "Beras Kencur Heritage",
    botanical: "Oryza · Kaempferia",
    category: "digestion",
    priceCents: 2600,
    tagline: "The classic rice-and-kencur restorative.",
    description:
      "Our faithful take on beras kencur, the toasted-rice tonic Javanese mothers have poured for generations. Nourishing, mellow, and gently sweet.",
    ingredients: [
      "Toasted rice (Oryza sativa)",
      "Kencur (Kaempferia galanga)",
      "Palm sugar (low-GI)",
      "Java cinnamon",
    ],
    allergens: [],
    benefits: [
      "Gentle digestive tonic",
      "Restorative & nourishing",
      "Naturally caffeine-free",
    ],
    howToUse: "Stir one sachet into 180 ml warm water or plant milk, any time of day.",
    certifications: ["Vegan", "EU Compliant", "Non-GMO"],
    netWeight: "20 sachets · 80 g",
    gradient: ["#b9a06f", "#6f8a5a"],
  },
  {
    id: "jm-05",
    slug: "secang-rosewood-harmony",
    name: "Secang Rosewood Harmony",
    botanical: "Caesalpinia sappan",
    category: "balance",
    priceCents: 3400,
    tagline: "The rose-red infusion of equilibrium.",
    description:
      "Sappanwood steeps into a luminous rose-red cup with a soft, woody sweetness. Long prized in Javanese wedang for warmth and balance, it is our most contemplative blend.",
    ingredients: [
      "Secang / sappanwood (Caesalpinia sappan) 80%",
      "Clove",
      "Java cinnamon",
      "Cardamom",
    ],
    allergens: [],
    benefits: [
      "Calming & centring",
      "Antioxidant-rich",
      "Evening wind-down ritual",
    ],
    howToUse:
      "Steep one sachet in 220 ml just-boiled water for 5 minutes. Ideal in the evening.",
    certifications: ["Organic", "Vegan", "EU Compliant", "GMP", "Non-GMO"],
    netWeight: "24 sachets · 96 g",
    featured: true,
    gradient: ["#b06d7a", "#9179ac"],
  },
  {
    id: "jm-06",
    slug: "kayu-manis-equilibrium",
    name: "Kayu Manis Equilibrium",
    botanical: "Cinnamomum burmannii",
    category: "balance",
    priceCents: 2900,
    tagline: "Sumatran cinnamon for steady balance.",
    description:
      "True Sumatran kayu manis, warm and honeyed, blended to support balanced blood sugar and a settled, even mood through the day.",
    ingredients: [
      "Sumatran cinnamon (Cinnamomum burmannii) 90%",
      "Ginger",
      "Cardamom",
    ],
    allergens: [],
    benefits: [
      "Supports balanced blood sugar",
      "Warming & grounding",
      "Naturally caffeine-free",
    ],
    howToUse: "Whisk one sachet into 150 ml warm water or milk, morning or evening.",
    certifications: ["Organic", "Vegan", "EU Compliant"],
    netWeight: "30 sachets · 90 g",
    gradient: ["#a98a63", "#9179ac"],
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function productsByCategory(category: Category): Product[] {
  return PRODUCTS.filter((p) => p.category === category);
}

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
