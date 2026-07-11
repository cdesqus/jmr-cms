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
