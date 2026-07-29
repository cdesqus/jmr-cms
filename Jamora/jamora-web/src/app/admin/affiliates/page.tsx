import { AdminAffiliatesManager } from "@/components/admin-affiliates-manager";
import { getAdminAffiliates } from "@/lib/admin-api";

export default async function AdminAffiliatesPage() {
  const affiliates = await getAdminAffiliates().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Growth
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Affiliates</h1>
        <p className="mt-2 text-sm text-slate-500">
          Invite affiliates, share tracked links, and review pending commission.
        </p>
      </div>
      <AdminAffiliatesManager affiliates={affiliates} />
    </div>
  );
}
