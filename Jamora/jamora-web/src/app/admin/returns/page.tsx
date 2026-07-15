import { AdminReturnsManager } from "@/components/admin-returns-manager";
import { getAdminNotifications, getAdminReturns } from "@/lib/admin-api";

export default async function AdminReturnsPage() {
  const [returns, notifications] = await Promise.all([
    getAdminReturns().catch(() => []),
    getAdminNotifications().catch(() => []),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Customer care</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Returns</h1>
        <p className="mt-2 text-sm text-slate-500">Approve, receive, restock, and refund returned orders.</p>
      </div>
      <AdminReturnsManager returns={returns} notifications={notifications} />
    </div>
  );
}
