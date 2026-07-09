import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = {
  title: "Your Cart",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="font-display text-4xl text-ink">Your cart</h1>
      <CartView />
    </div>
  );
}
