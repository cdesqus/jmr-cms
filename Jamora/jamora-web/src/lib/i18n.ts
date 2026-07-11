export type Locale = "en" | "ro";

export const LOCALE_COOKIE = "jamora_locale";

export const UI_TEXT: Record<Locale, Record<string, string>> = {
  en: {
    home: "Home",
    shop: "Shop",
    story: "Our Story",
    contact: "Contact",
    track: "Track",
    trackOrder: "Track order",
    cart: "Cart",
    viewAll: "View all",
    shopPrefix: "Shop",
    testimonialsEyebrow: "Loved in Europe",
    testimonialsTitle: "A quiet ritual, thousands of mornings.",
    statOrigin: "Indonesian origin",
    statAdditives: "Artificial additives",
    statCompliance: "Compliance verified",
    addToCart: "Add to cart",
    outOfStock: "Out of stock",
    inStock: "in stock",
    categoryEnergy: "Energy",
    categoryDigestion: "Digestion",
    categoryBalance: "Balance",
  },
  ro: {
    home: "Acasa",
    shop: "Magazin",
    story: "Povestea Noastra",
    contact: "Contact",
    track: "Urmareste",
    trackOrder: "Urmareste comanda",
    cart: "Cos",
    viewAll: "Vezi toate",
    shopPrefix: "Cumpara",
    testimonialsEyebrow: "Apreciat in Europa",
    testimonialsTitle: "Un ritual linistit, mii de dimineti.",
    statOrigin: "Origine indoneziana",
    statAdditives: "Aditivi artificiali",
    statCompliance: "Conformitate verificata",
    addToCart: "Adauga in cos",
    outOfStock: "Stoc epuizat",
    inStock: "in stoc",
    categoryEnergy: "Energie",
    categoryDigestion: "Digestie",
    categoryBalance: "Echilibru",
  },
};

export const PRODUCT_TEXT: Record<
  Locale,
  Record<string, Partial<Record<"tagline" | "description", string>>>
> = {
  en: {},
  ro: {
    "beras-kencur-heritage": {
      tagline: "Tonicul clasic restaurator din orez si kencur.",
    },
    "kayu-manis-equilibrium": {
      tagline: "Scortisoara de Sumatra pentru echilibru constant.",
    },
    "kencur-calm": {
      tagline: "Ghimbir aromatic pentru a linisti centrul.",
    },
    "red-ginger-ember": {
      tagline: "Jahe merah - caldura care te pune in miscare.",
    },
    "secang-rosewood-harmony": {
      tagline: "Infuzia rosu-trandafirie a echilibrului.",
    },
    "temulawak-vitality": {
      tagline: "Radacina aurie din Java, standardizata pentru energie constanta.",
    },
  },
};

export function asLocale(value?: string | null): Locale {
  return value === "ro" ? "ro" : "en";
}

export function localized<T extends Record<string, any>>(
  content: T,
  locale: Locale,
  key: keyof T & string,
) {
  if (locale === "ro") {
    const ro = content[`${key}Ro`];
    if (typeof ro === "string" && ro.trim()) return ro;
  }
  return content[key];
}

export function productText(
  slug: string,
  locale: Locale,
  key: "tagline" | "description",
  fallback: string,
) {
  return PRODUCT_TEXT[locale][slug]?.[key] ?? fallback;
}

export function categoryLabel(category: string, locale: Locale) {
  const labels: Record<string, string> = {
    energy: UI_TEXT[locale].categoryEnergy,
    digestion: UI_TEXT[locale].categoryDigestion,
    balance: UI_TEXT[locale].categoryBalance,
  };
  return labels[category] ?? category;
}
