import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CATEGORY_META, formatEUR } from "@/lib/products";
import { getProductBySlug, getProductsByCategory } from "@/lib/catalog";
import { ProductVisual } from "@/components/product-visual";
import { CategoryPill, CertificationBadges } from "@/components/badges";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { ProductCard } from "@/components/product-card";

export async function generateMetadata(
  props: PageProps<"/product/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: product.tagline,
  };
}

export default async function ProductPage(props: PageProps<"/product/[slug]">) {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const meta = CATEGORY_META[product.category];
  const related = (await getProductsByCategory(product.category))
    .filter((p) => p.id !== product.id)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <nav className="text-sm text-stone">
        <Link href="/shop" className="hover:text-terracotta">
          Shop
        </Link>
        <span className="px-2">/</span>
        <Link href={`/shop?c=${product.category}`} className="hover:text-terracotta">
          {meta.label}
        </Link>
        <span className="px-2">/</span>
        <span className="text-bark">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductVisual
          product={product}
          className="aspect-[4/5] w-full shadow-sm lg:sticky lg:top-24"
        />

        <div>
          <CategoryPill category={product.category} />
          <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-1 text-sm italic text-stone">{product.botanical}</p>

          <p className="mt-5 text-lg text-bark">{product.tagline}</p>
          <p className="mt-4 text-bark">{product.description}</p>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-display text-3xl text-ink">
              {formatEUR(product.priceCents)}
            </span>
            <span className="text-sm text-stone">{product.netWeight}</span>
          </div>
          {typeof product.stock === "number" && (
            <p className="mt-2 text-sm font-medium text-bark">
              {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
            </p>
          )}

          <div className="mt-6 max-w-xs">
            <AddToCartButton product={product} />
          </div>
          <p className="mt-3 text-xs text-stone">
            VAT included · EU shipping calculated at checkout · Ships from our
            Romania fulfilment centre.
          </p>

          {/* Benefits */}
          <section className="mt-9 border-t border-clay/60 pt-6">
            <h2 className="eyebrow text-stone">Benefits</h2>
            <ul className="mt-3 space-y-2">
              {product.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2 text-bark">
                  <span
                    className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: meta.colorVar }}
                  />
                  {b}
                </li>
              ))}
            </ul>
          </section>

          {/* Ingredients */}
          <section className="mt-8 border-t border-clay/60 pt-6">
            <h2 className="eyebrow text-stone">Ingredients</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-bark">
              {product.ingredients.map((ing) => (
                <li key={ing}>{ing}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-bark">
              <span className="font-semibold text-ink">Allergens: </span>
              {product.allergens.length > 0
                ? product.allergens.join(", ")
                : "None declared. Produced in a facility that also handles nuts and sesame."}
            </p>
          </section>

          {/* How to use */}
          <section className="mt-8 border-t border-clay/60 pt-6">
            <h2 className="eyebrow text-stone">How to use</h2>
            <p className="mt-3 text-bark">{product.howToUse}</p>
          </section>

          {/* Certifications */}
          <section className="mt-8 border-t border-clay/60 pt-6">
            <h2 className="eyebrow text-stone">Certifications</h2>
            <CertificationBadges items={product.certifications} className="mt-3" />
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="font-display text-2xl text-ink">
            More from {meta.label}
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
