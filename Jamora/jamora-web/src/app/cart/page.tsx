import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";
import { getCurrentCustomer } from "@/lib/customer-api";
import { getCustomerMemberships } from "@/lib/membership-customer-api";

export const metadata: Metadata = {
  title: "Your Cart",
};
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const customer = process.env.MEMBERSHIP_ENABLED === "true"
    ? await getCurrentCustomer()
    : null;
  const memberships = customer
    ? await getCustomerMemberships(customer).catch(() => [])
    : [];
  const activeMembership = memberships.find((membership) =>
    membership.status === "active" &&
    membership.ledgerBalance > 0 &&
    !!membership.endsAt &&
    new Date(membership.endsAt) > new Date());
  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="font-display text-4xl text-ink">Your cart</h1>
      <CartView
        structuredCheckoutEnabled={process.env.STRUCTURED_CHECKOUT_ENABLED === "true"}
        membership={activeMembership}
      />
    </div>
  );
}
