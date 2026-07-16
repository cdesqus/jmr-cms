import { AdminBatchManager } from "@/components/admin-batch-manager";
import { AdminBatchImport } from "@/components/admin-batch-import";
import { getAdminProducts, getInventoryBatches } from "@/lib/admin-api";

export default async function InventoryBatchesPage() {
  const [products, batches] = await Promise.all([
    getAdminProducts().catch(() => []),
    getInventoryBatches().catch(() => []),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Inventory control</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Batches & expiry</h1>
        <p className="mt-2 text-sm text-slate-500">FEFO allocation uses the active batch with the nearest expiry date first.</p>
      </div>
      <AdminBatchImport />
      <AdminBatchManager products={products} batches={batches} />
    </div>
  );
}
