import Link from "next/link";
import { CATEGORY_META, type Category } from "@/lib/products";
import { getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { ProductVisual } from "@/components/product-visual";

const CERTS = ["Organic", "Vegan", "EU Compliant", "GMP", "Non-GMO"];

const TESTIMONIALS = [
  {
    quote:
      "Temulawak Vitality replaced my second coffee. Same focus, none of the jitters — and it tastes like something with a story.",
    name: "Lena V.",
    location: "Amsterdam, NL",
  },
  {
    quote:
      "As a nutritionist I'm sceptical of wellness fads. Jamora's ingredient transparency and EU certifications won me over.",
    name: "Mathias K.",
    location: "Berlin, DE",
  },
  {
    quote:
      "The Secang Rosewood evening cup has become my wind-down ritual. Beautiful, calming, and genuinely well made.",
    name: "Camille R.",
    location: "Lyon, FR",
  },
];

export default async function Home() {
  const featured = await getFeaturedProducts(3);
  const categories = Object.keys(CATEGORY_META) as Category[];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 pb-12 pt-6 lg:grid-cols-2 lg:pt-8">
          <div>
            <p className="eyebrow text-terracotta">Energi · Digestie · Echlibru</p>
            <h1 className="mt-3 font-display text-3xl leading-[1.1] text-ink sm:text-4xl lg:text-5xl">
              100% Made in Indonesia,
              <span className="text-terracotta"> standardised for Europe.</span>
            </h1>
            <p className="mt-4 max-w-md text-base text-bark sm:text-lg">
              Premium jamu — Indonesia&rsquo;s living herbal tradition — refined
              to European standards of purity, transparency, and taste.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/shop"
                className="rounded-full bg-terracotta px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
              >
                Explore the collection
              </Link>
              <Link
                href="/about"
                className="rounded-full border border-clay bg-white/50 px-7 py-3 text-sm font-semibold text-bark transition-colors hover:border-terracotta hover:text-terracotta"
              >
                Our story
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-stone">
              {CERTS.map((c) => (
                <li key={c} className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-herb" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* One compact hero render — full pouch, native 4:5, no cropping. */}
          <div className="mx-auto w-full max-w-[300px]">
            <ProductVisual
              product={featured[0]}
              className="aspect-[4/5] w-full shadow-md"
            />
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="border-y border-clay/50 bg-sand/30">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="max-w-xl">
            <p className="eyebrow text-stone">Three pillars</p>
            <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
              One tradition, three ways to feel well.
            </h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {categories.map((c) => {
              const meta = CATEGORY_META[c];
              return (
                <Link
                  key={c}
                  href={`/shop?c=${c}`}
                  className="group rounded-xl border border-clay/70 bg-cream p-7 transition-colors hover:border-terracotta/50"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: meta.colorVar }}
                  />
                  <h3 className="mt-4 font-display text-2xl text-ink">
                    {meta.label}
                  </h3>
                  <p className="text-sm font-medium" style={{ color: meta.colorVar }}>
                    {meta.pillar}
                  </p>
                  <p className="mt-3 text-sm text-bark">{meta.blurb}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-terracotta">
                    Shop {meta.label}
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow text-stone">Best sellers</p>
            <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
              Loved across Europe
            </h2>
          </div>
          <Link
            href="/shop"
            className="hidden text-sm font-semibold text-terracotta hover:text-terracotta-deep sm:inline"
          >
            View all →
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-y border-clay/50 bg-sand/30">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="max-w-xl">
            <p className="eyebrow text-stone">Loved in Europe</p>
            <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
              A quiet ritual, thousands of mornings.
            </h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col rounded-xl border border-clay/70 bg-cream p-6"
              >
                <div className="flex gap-0.5 text-terracotta" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-bark">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-semibold text-ink">{t.name}</span>
                  <span className="text-stone"> · {t.location}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Story strip */}
      <section className="border-t border-clay/50 bg-herb-deep text-cream">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow text-amber">From root to cup</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl">
              Traceable botanicals, standardised potency.
            </h2>
            <p className="mt-4 max-w-lg text-cream/80">
              Every batch is single-origin, lab-verified for active compounds,
              and documented from the Javanese highlands to your kitchen — so a
              cup of Jamora in Bucharest tastes exactly as intended in Yogyakarta.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-center">
            {[
              { n: "100%", l: "Indonesian origin" },
              { n: "0", l: "Artificial additives" },
              { n: "EU", l: "Compliance verified" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-cream/5 p-5">
                <dt className="font-display text-3xl text-amber">{s.n}</dt>
                <dd className="mt-1 text-xs text-cream/70">{s.l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
