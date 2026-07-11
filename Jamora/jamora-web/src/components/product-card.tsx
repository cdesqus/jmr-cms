"use client";

import Link from "next/link";
import { useLocale } from "@/components/use-locale";
import { UI_TEXT, categoryLabel, productText } from "@/lib/i18n";
import { formatEUR, type Product } from "@/lib/products";
import { ProductVisual } from "@/components/product-visual";
import { CategoryPill } from "@/components/badges";
import { AddToCartButton } from "@/components/add-to-cart-button";

export function ProductCard({ product }: { product: Product }) {
  const locale = useLocale();
  const stockLabel =
    typeof product.stock === "number"
      ? product.stock > 0
        ? `${product.stock} ${UI_TEXT[locale].inStock}`
        : UI_TEXT[locale].outOfStock
      : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-clay/70 bg-white/50 transition-colors hover:border-terracotta/50">
      <Link
        href={`/product/${product.slug}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        aria-label={product.name}
      >
        <ProductVisual
          product={product}
          rounded="rounded-none"
          className="aspect-[4/5] w-full transition-transform duration-500 group-hover:scale-[1.02]"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <CategoryPill
            category={product.category}
            label={categoryLabel(product.category, locale)}
          />
          <span className="text-sm font-semibold text-ink">
            {formatEUR(product.priceCents)}
          </span>
        </div>
        <div>
          <h3 className="font-display text-lg leading-tight text-ink">
            <Link href={`/product/${product.slug}`} className="hover:text-terracotta">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-stone">
            {productText(product.slug, locale, "tagline", product.tagline)}
          </p>
          {stockLabel && <p className="mt-2 text-xs font-medium text-bark">{stockLabel}</p>}
        </div>
        <div className="mt-auto pt-1">
          <AddToCartButton product={product} variant="soft" />
        </div>
      </div>
    </article>
  );
}
