import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, UI_TEXT, asLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Jamora brings Indonesia's centuries-old jamu tradition to Europe - traceable, lab-verified, and standardised without losing its soul.",
};

const CERTS = [
  { name: "Organic (EU)", note: "Certified organic botanicals under EU regulation 2018/848." },
  { name: "Vegan", note: "No animal-derived ingredients or processing aids." },
  { name: "GMP", note: "Manufactured under Good Manufacturing Practice." },
  { name: "EU Compliant", note: "Meets EU food-supplement labelling & safety rules." },
  { name: "Non-GMO", note: "No genetically modified inputs." },
];

const SOURCING_POINTS = {
  en: [
    ["Single-origin", "Every botanical traceable to its farm."],
    ["Lab-verified", "Tested for potency, heavy metals, microbes."],
    ["Fair trade", "Above-market pricing for growers."],
    ["Fresh-dried", "Dried within hours of harvest."],
  ],
  ro: [
    ["Origine unica", "Fiecare planta poate fi urmarita pana la ferma."],
    ["Verificat in laborator", "Testat pentru potenta, metale grele si microbi."],
    ["Comert corect", "Preturi peste piata pentru cultivatori."],
    ["Uscare proaspata", "Uscat in cateva ore dupa recoltare."],
  ],
};

export default async function AboutPage() {
  const cookieStore = await cookies();
  const locale = asLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const text = UI_TEXT[locale];

  return (
    <div>
      <section className="mx-auto max-w-3xl px-5 py-16 text-center">
        <p className="eyebrow text-terracotta">{text.storyEyebrow}</p>
        <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">
          {text.storyTitle}
        </h1>
        <p className="mt-6 text-lg text-bark">{text.storyIntro}</p>
      </section>

      <section id="sourcing" className="scroll-mt-20 border-y border-clay/50 bg-sand/30">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-3xl text-ink">{text.sourcingTitle}</h2>
            <p className="mt-4 text-bark">{text.sourcingBody}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {SOURCING_POINTS[locale].map(([title, description]) => (
              <li key={title} className="rounded-xl border border-clay/70 bg-cream p-5">
                <h3 className="font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm text-stone">{description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="certifications" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl text-ink">{text.certificationsTitle}</h2>
          <p className="mt-4 text-bark">{text.certificationsBody}</p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CERTS.map((cert) => (
            <div
              key={cert.name}
              className="rounded-xl border border-clay/70 bg-white/50 p-6"
            >
              <h3 className="font-display text-xl text-ink">{cert.name}</h3>
              <p className="mt-2 text-sm text-stone">{cert.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-clay/50 bg-herb-deep text-cream">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center">
          <h2 className="font-display text-3xl sm:text-4xl">{text.storyCtaTitle}</h2>
          <p className="mt-3 text-cream/80">{text.storyCtaBody}</p>
          <Link
            href="/shop"
            className="mt-7 inline-flex rounded-full bg-amber px-7 py-3 text-sm font-semibold text-ink transition-colors hover:bg-cream"
          >
            {text.viewAll}
          </Link>
        </div>
      </section>
    </div>
  );
}
