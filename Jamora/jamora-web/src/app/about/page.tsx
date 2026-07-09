import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Jamora brings Indonesia's centuries-old jamu tradition to Europe — traceable, lab-verified, and standardised without losing its soul.",
};

const CERTS = [
  { name: "Organic (EU)", note: "Certified organic botanicals under EU regulation 2018/848." },
  { name: "Vegan", note: "No animal-derived ingredients or processing aids." },
  { name: "GMP", note: "Manufactured under Good Manufacturing Practice." },
  { name: "EU Compliant", note: "Meets EU food-supplement labelling & safety rules." },
  { name: "Non-GMO", note: "No genetically modified inputs." },
];

export default function AboutPage() {
  return (
    <div>
      {/* Intro */}
      <section className="mx-auto max-w-3xl px-5 py-16 text-center">
        <p className="eyebrow text-terracotta">Our Story</p>
        <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">
          A living tradition, carried carefully to Europe.
        </h1>
        <p className="mt-6 text-lg text-bark">
          Jamu is Indonesia&rsquo;s indigenous herbal craft — recipes passed
          hand to hand for over a thousand years. Jamora exists to bring that
          craft to Europe honestly: the same roots, the same intent, held to the
          continent&rsquo;s highest standards of safety and transparency.
        </p>
      </section>

      {/* Sourcing */}
      <section id="sourcing" className="border-y border-clay/50 bg-sand/30 scroll-mt-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-3xl text-ink">Sourcing</h2>
            <p className="mt-4 text-bark">
              We work directly with smallholder farmers across Java and Sumatra,
              paying above-market rates for single-origin roots and barks. Each
              harvest is traceable to its plot, dried within hours, and shipped to
              our EU facility where it is lab-verified for active compounds and
              contaminants before it ever reaches a sachet.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ["Single-origin", "Every botanical traceable to its farm."],
              ["Lab-verified", "Tested for potency, heavy metals, microbes."],
              ["Fair trade", "Above-market pricing for growers."],
              ["Fresh-dried", "Dried within hours of harvest."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-xl border border-clay/70 bg-cream p-5">
                <h3 className="font-semibold text-ink">{t}</h3>
                <p className="mt-1 text-sm text-stone">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Certifications */}
      <section id="certifications" className="mx-auto max-w-6xl px-5 py-16 scroll-mt-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl text-ink">Certifications</h2>
          <p className="mt-4 text-bark">
            Trust in a health product is earned through evidence. Here is what
            stands behind every Jamora tin.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CERTS.map((c) => (
            <div
              key={c.name}
              className="rounded-xl border border-clay/70 bg-white/50 p-6"
            >
              <h3 className="font-display text-xl text-ink">{c.name}</h3>
              <p className="mt-2 text-sm text-stone">{c.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-clay/50 bg-herb-deep text-cream">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center">
          <h2 className="font-display text-3xl sm:text-4xl">
            Taste the tradition.
          </h2>
          <p className="mt-3 text-cream/80">
            Start with a best-seller from Energy, Digestion, or Balance.
          </p>
          <Link
            href="/shop"
            className="mt-7 inline-flex rounded-full bg-amber px-7 py-3 text-sm font-semibold text-ink transition-colors hover:bg-cream"
          >
            Explore the collection
          </Link>
        </div>
      </section>
    </div>
  );
}
