import Link from "next/link";
import type { Metadata } from "next";
import { CATEGORY_META, type Category } from "@/lib/products";
import { getAllProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse Jamora's collection of premium Indonesian jamu — Energy, Digestion, and Balance.",
};

const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

function isCategory(v: string | undefined): v is Category {
  return v === "energy" || v === "digestion" || v === "balance";
}

export default async function ShopPage(props: PageProps<"/shop">) {
  const { c } = await props.searchParams;
  const active = isCategory(typeof c === "string" ? c : undefined)
    ? (c as Category)
    : undefined;

  const all = await getAllProducts();
  const products = active ? all.filter((p) => p.category === active) : all;

  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <header className="max-w-2xl">
        <p className="eyebrow text-terracotta">The Collection</p>
        <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
          {active ? CATEGORY_META[active].label : "All products"}
        </h1>
        <p className="mt-4 text-bark">
          {active
            ? CATEGORY_META[active].blurb
            : "Single-origin Indonesian botanicals, standardised for Europe and organised by how you want to feel."}
        </p>
      </header>

      {/* Filter tabs */}
      <nav className="mt-8 flex flex-wrap gap-2">
        <FilterTab href="/shop" label="All" activeCondition={!active} />
        {CATEGORIES.map((cat) => (
          <FilterTab
            key={cat}
            href={`/shop?c=${cat}`}
            label={CATEGORY_META[cat].label}
            activeCondition={active === cat}
            color={CATEGORY_META[cat].colorVar}
          />
        ))}
      </nav>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

function FilterTab({
  href,
  label,
  activeCondition,
  color,
}: {
  href: string;
  label: string;
  activeCondition: boolean;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${
        activeCondition
          ? "border-transparent bg-ink text-cream"
          : "border-clay bg-white/50 text-bark hover:border-terracotta hover:text-terracotta"
      }`}
      style={activeCondition && color ? { background: color } : undefined}
    >
      {label}
    </Link>
  );
}
