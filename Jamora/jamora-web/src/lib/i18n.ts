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
    allProducts: "All products",
    all: "All",
    collectionEyebrow: "The Collection",
    collectionIntro:
      "Single-origin Indonesian botanicals, standardised for Europe and organised by how you want to feel.",
    categoryEnergyBlurb:
      "Rooted tonics of turmeric and red ginger to kindle steady, clean vitality.",
    categoryDigestionBlurb:
      "Warming aromatics that settle, soothe, and restore the gut's natural rhythm.",
    categoryBalanceBlurb:
      "Gentle adaptogenic botanicals to bring the body back into quiet equilibrium.",
    storyEyebrow: "Our Story",
    storyTitle: "A living tradition, carried carefully to Europe.",
    storyIntro:
      "Jamu is Indonesia's indigenous herbal craft - recipes passed hand to hand for over a thousand years. Jamora exists to bring that craft to Europe honestly: the same roots, the same intent, held to the continent's highest standards of safety and transparency.",
    sourcingTitle: "Sourcing",
    sourcingBody:
      "We work directly with smallholder farmers across Java and Sumatra, paying above-market rates for single-origin roots and barks. Each harvest is traceable to its plot, dried within hours, and shipped to our EU facility where it is lab-verified for active compounds and contaminants before it ever reaches a sachet.",
    certificationsTitle: "Certifications",
    certificationsBody:
      "Trust in a health product is earned through evidence. Here is what stands behind every Jamora tin.",
    storyCtaTitle: "Taste the tradition.",
    storyCtaBody: "Start with a best-seller from Energy, Digestion, or Balance.",
    contactTitle: "We'd love to hear from you.",
    contactIntro:
      "Questions about a botanical, an order, or EU wholesale? Send us a note and a real person will reply within two business days.",
    reachUs: "Reach us directly",
    customerCare: "Customer care",
    wholesaleRetail: "Wholesale & retail",
    euFulfilment: "EU fulfilment",
    followUs: "Follow us",
    name: "Name",
    email: "Email",
    topic: "Topic",
    message: "Message",
    sendMessage: "Send message",
    sending: "Sending...",
    messageSent: "Message sent",
    messageSentBody: "Thank you for reaching out. We'll reply within two business days.",
    sendAnother: "Send another message",
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
    allProducts: "Toate produsele",
    all: "Toate",
    collectionEyebrow: "Colectia",
    collectionIntro:
      "Botanice indoneziene cu origine unica, standardizate pentru Europa si organizate dupa felul in care vrei sa te simti.",
    categoryEnergyBlurb:
      "Tonice din radacini de turmeric si ghimbir rosu pentru vitalitate curata si constanta.",
    categoryDigestionBlurb:
      "Aromatice calde care linistesc, calmeaza si sustin ritmul natural al digestiei.",
    categoryBalanceBlurb:
      "Botanice adaptogene blande care readuc corpul intr-un echilibru linistit.",
    storyEyebrow: "Povestea Noastra",
    storyTitle: "O traditie vie, adusa cu grija in Europa.",
    storyIntro:
      "Jamu este mestesugul herbal indigen al Indoneziei - retete transmise din mana in mana de peste o mie de ani. Jamora aduce acest mestesug in Europa cu onestitate: aceleasi radacini, aceeasi intentie, la cele mai inalte standarde de siguranta si transparenta.",
    sourcingTitle: "Origine",
    sourcingBody:
      "Lucram direct cu mici fermieri din Java si Sumatra, platind peste pretul pietei pentru radacini si scoarte cu origine unica. Fiecare recolta este trasabila pana la parcela, uscata in cateva ore si trimisa catre facilitatile noastre din UE, unde este verificata in laborator pentru compusi activi si contaminanti.",
    certificationsTitle: "Certificari",
    certificationsBody:
      "Increderea intr-un produs de wellness se castiga prin dovezi. Iata ce sustine fiecare produs Jamora.",
    storyCtaTitle: "Gusta traditia.",
    storyCtaBody: "Incepe cu un best-seller din Energie, Digestie sau Echilibru.",
    contactTitle: "Ne-ar placea sa auzim de la tine.",
    contactIntro:
      "Ai intrebari despre botanice, o comanda sau distributie in UE? Trimite-ne un mesaj si o persoana reala iti raspunde in doua zile lucratoare.",
    reachUs: "Contact direct",
    customerCare: "Suport clienti",
    wholesaleRetail: "Wholesale & retail",
    euFulfilment: "Fulfilment UE",
    followUs: "Urmareste-ne",
    name: "Nume",
    email: "Email",
    topic: "Subiect",
    message: "Mesaj",
    sendMessage: "Trimite mesajul",
    sending: "Se trimite...",
    messageSent: "Mesaj trimis",
    messageSentBody: "Multumim pentru mesaj. Iti raspundem in doua zile lucratoare.",
    sendAnother: "Trimite alt mesaj",
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

export function categoryBlurb(category: string, locale: Locale) {
  const blurbs: Record<string, string> = {
    energy: UI_TEXT[locale].categoryEnergyBlurb,
    digestion: UI_TEXT[locale].categoryDigestionBlurb,
    balance: UI_TEXT[locale].categoryBalanceBlurb,
  };
  return blurbs[category] ?? "";
}
