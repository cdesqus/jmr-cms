import Link from "next/link";
import { MockMembershipCheckout } from "@/components/mock-membership-checkout";

export default async function MembershipCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const plan = String(params.name ?? "Membership plan");
  const months = String(params.months ?? "3");
  const price = Number(params.price ?? 0) / 100;
  return <main className="mx-auto max-w-3xl px-5 py-16 sm:py-24"><Link href="/membership" className="text-sm text-terracotta">← Back to memberships</Link><h1 className="mt-5 font-display text-4xl font-semibold">Membership checkout</h1><p className="mt-3 text-stone">Enter your details first. We will create/link your customer account after payment confirmation.</p><MockMembershipCheckout plan={plan} months={months} price={price} /></main>;
}
