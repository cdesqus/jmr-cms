import { notFound, redirect } from "next/navigation";
import { MembershipPlanPicker } from "@/components/membership-plan-picker";
import { getCurrentCustomer } from "@/lib/customer-api";
import { getCustomerMembershipPlans } from "@/lib/membership-customer-api";

export default async function MembershipPlansPage() {
  if (process.env.MEMBERSHIP_ENABLED !== "true") notFound();
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login");
  const plans = await getCustomerMembershipPlans(customer);
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
      <p className="eyebrow text-terracotta">Prepaid membership</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">Choose your rhythm</h1>
      <p className="mt-4 max-w-2xl text-stone">Choose 3, 6, or 12 months. Renewal is always manual.</p>
      <div className="mt-10"><MembershipPlanPicker plans={plans} /></div>
    </div>
  );
}
