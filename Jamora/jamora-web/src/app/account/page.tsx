import { redirect } from "next/navigation";
import { CustomerLogoutButton } from "@/components/customer-auth-form";
import { getCurrentCustomer } from "@/lib/customer-api";
import { AccountPageFrame, requireCustomerAccounts } from "./account-page";

export default async function AccountPage() {
  requireCustomerAccounts();
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login");

  return (
    <AccountPageFrame>
      <section className="mx-auto max-w-2xl rounded-xl border border-clay bg-white/70 p-6 sm:p-8">
        <p className="eyebrow text-terracotta">Customer account</p>
        <h1 className="mt-3 font-display text-3xl font-semibold">
          Hello, {customer.name}
        </h1>
        <dl className="my-7 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-semibold text-bark">Email</dt>
          <dd className="text-ink">{customer.email}</dd>
          <dt className="font-semibold text-bark">Status</dt>
          <dd className="text-herb-deep">Verified</dd>
        </dl>
        {process.env.MEMBERSHIP_ENABLED === "true" && (
          <div className="mb-7 flex flex-wrap gap-3">
            <a href="/account/membership" className="rounded-full bg-bark px-5 py-3 text-sm font-semibold text-white">
              Membership dashboard
            </a>
            <a href="/account/membership/plans" className="rounded-full border border-bark px-5 py-3 text-sm font-semibold">
              View membership plans
            </a>
          </div>
        )}
        <CustomerLogoutButton />
      </section>
    </AccountPageFrame>
  );
}
