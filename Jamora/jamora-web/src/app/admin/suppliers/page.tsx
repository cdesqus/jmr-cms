import { AdminSuppliersManager } from "@/components/admin-suppliers-manager";
import { getSuppliers } from "@/lib/admin-api";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers().catch(() => []);
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Procurement</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Suppliers</h1><p className="mt-2 text-sm text-slate-500">Manage factories and production partners used by purchase orders.</p></div><AdminSuppliersManager suppliers={suppliers} /></div>;
}
