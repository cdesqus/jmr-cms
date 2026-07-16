import { AdminReceivingWorkspace } from "@/components/admin-receiving-workspace";
import { getPurchaseOrders } from "@/lib/admin-api";

export default async function ReceivingPage() {
  const purchaseOrders = await getPurchaseOrders().catch(() => []);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Warehouse</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Receiving</h1>
      </div>
      <AdminReceivingWorkspace purchaseOrders={purchaseOrders} />
    </div>
  );
}
