"use client";

import { useCart } from "@/components/cart-context";
import type { Product } from "@/lib/products";

export function AddToCartButton({
  product,
  qty = 1,
  variant = "solid",
  className = "",
}: {
  product: Product;
  qty?: number;
  variant?: "solid" | "soft";
  className?: string;
}) {
  const { add } = useCart();

  const base =
    "inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream";
  const styles =
    variant === "solid"
      ? "bg-terracotta text-cream hover:bg-terracotta-deep"
      : "bg-sand text-bark hover:bg-clay";

  return (
    <button
      type="button"
      onClick={() => add(product, qty)}
      className={`${base} ${styles} ${className}`}
    >
      Add to cart
    </button>
  );
}
