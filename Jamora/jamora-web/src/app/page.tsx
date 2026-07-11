import Link from "next/link";
import { cookies } from "next/headers";
import { CATEGORY_META, type Category } from "@/lib/products";
import { getFeaturedProducts } from "@/lib/catalog";
import { getPublicStoreContent, localizeStoreContent } from "@/lib/store-content";
import { LOCALE_COOKIE, UI_TEXT, asLocale } from "@/lib/i18n";
import { ProductCard } from "@/components/product-card";
import { ProductVisual } from "@/components/product-visual";

const TESTIMONIALS = [
  {
    quote:
      "Temulawak Vitality replaced my second coffee. Same focus, none of the jitters - and it tastes like something with a story.",
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
  const cookieStore = await cookies();
  const locale = asLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const ui = UI_TEXT[locale];
  const [featured, rawContent] = await Promise.all([
    getFeaturedProducts(3),
    getPublicStoreContent(),
  ]);
  const content = localizeStoreContent(rawContent, locale);
  const categories = Object.keys(CATEGORY_META) as Category[];

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 pb-12 pt-6 lg:grid-cols-2 lg:pt-8">
          <div>
            <p className="eyebrow text-terracotta">{content.heroEyebrow}</p>
            <h1 className="mt-3 font-display text-3xl leading-[1.1] text-ink sm:text-4xl lg:text-5xl">
              {content.heroTitle}
              <span className="text-terracotta"> {content.heroHighlight}</span>
            </h1>
            <p className="mt-4 max-w-md text-base text-bark sm:text-lg">
              {content.heroDescription}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/shop"
                className="rounded-full bg-terracotta px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
              >
                {content.primaryCtaLabel}
              </Link>
              <Link
                href="/about"
                className="rounded-full border border-clay bg-white/50 px-7 py-3 text-sm font-semibold text-bark transition-colors hover:border-terracotta hover:text-terracotta"
              >
                {content.secondaryCtaLabel}
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-stone">
              {content.certifications.map((certification) => (
                <li key={certification} className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-herb" />
                  {certification}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-[300px]">
            <ProductVisual
              product={featured[0]}
              className="aspect-[4/5] w-full shadow-md"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-clay/50 bg-sand/30">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="max-w-xl">
            <p className="eyebrow text-stone">{content.pillarsEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
              {content.pillarsTitle}
            </h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {categories.map((category) => {
              const meta = CATEGORY_META[category];
              return (
                <Link
                  key={category}
                  href={`/shop?c=${category}`}
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
                    {ui.shopPrefix} {meta.label}
                    <span className="transition-transform group-hover:translate-x-1">-&gt;</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow text-stone">{content.featuredEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
              {content.featuredTitle}
            </h2>
          </div>
          <Link
            href="/shop"
            className="hidden text-sm font-semibold text-terracotta hover:text-terracotta-deep sm:inline"
          >
            {ui.viewAll} -&gt;
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="border-y border-clay/50 bg-sand/30">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="max-w-xl">
            <p className="eyebrow text-stone">{ui.testimonialsEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
              {ui.testimonialsTitle}
            </h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <figure
                key={testimonial.name}
                className="flex flex-col rounded-xl border border-clay/70 bg-cream p-6"
              >
                <div className="flex gap-0.5 text-terracotta" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <svg key={index} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-bark">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-semibold text-ink">{testimonial.name}</span>
                  <span className="text-stone"> - {testimonial.location}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-clay/50 bg-herb-deep text-cream">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow text-amber">{content.storyEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl">
              {content.storyTitle}
            </h2>
            <p className="mt-4 max-w-lg text-cream/80">
              {content.storyDescription}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-center">
            {[
              { n: "100%", l: ui.statOrigin },
              { n: "0", l: ui.statAdditives },
              { n: "EU", l: ui.statCompliance },
            ].map((stat) => (
              <div key={stat.l} className="rounded-xl bg-cream/5 p-5">
                <dt className="font-display text-3xl text-amber">{stat.n}</dt>
                <dd className="mt-1 text-xs text-cream/70">{stat.l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
