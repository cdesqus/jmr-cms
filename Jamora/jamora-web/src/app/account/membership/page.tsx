import { notFound, redirect } from "next/navigation";
import { MembershipDashboard } from "@/components/membership-dashboard";
import { getCurrentCustomer } from "@/lib/customer-api";
import { getCustomerMemberships } from "@/lib/membership-customer-api";

export default async function MembershipPage() {
  if (process.env.MEMBERSHIP_ENABLED !== "true") notFound();
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login");
  const memberships = await getCustomerMemberships(customer);
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
      <p className="eyebrow text-terracotta">Your Jamora membership</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">Membership dashboard</h1>
      <div className="mt-9"><MembershipDashboard memberships={memberships} /></div>
    </div>
  );
}
