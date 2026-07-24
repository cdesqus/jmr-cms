import { notFound, redirect } from "next/navigation";
import { AdminMembershipManager } from "@/components/admin-membership-manager";
import { getAdminProducts } from "@/lib/admin-api";
import { getAdminIdentity } from "@/lib/admin-session";
import { getMembershipPlans, getMemberships } from "@/lib/membership-api";

export default async function AdminMembershipPage() {
  if (process.env.MEMBERSHIP_ENABLED !== "true") notFound();
  const identity = await getAdminIdentity();
  if (identity?.role !== "owner") redirect("/admin");

  const [plans, memberships, products] = await Promise.all([
    getMembershipPlans(),
    getMemberships(),
    getAdminProducts(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Content management</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Membership</h1>
        <p className="mt-2 text-sm text-slate-500">
          Configure prepaid plans, review member periods, and post audited credit adjustments.
        </p>
      </div>
      <AdminMembershipManager
        plans={plans}
        memberships={memberships}
        products={products.map(({ slug, name }) => ({ slug, name }))}
      />
    </div>
  );
}
