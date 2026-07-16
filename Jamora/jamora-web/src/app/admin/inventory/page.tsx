import Link from "next/link";
import { getAdminProducts, getInventoryMovements } from "@/lib/admin-api";

export default async function AdminInventoryPage() {
  const [products, movements] = await Promise.all([
    getAdminProducts().catch(() => []),
    getInventoryMovements().catch(() => []),
  ]);
  const units = products.reduce((sum, product) => sum + (product.stock ?? 0), 0);
  const lowStock = products.filter(
    (product) => (product.stock ?? 0) <= (product.minStock ?? 10),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Stock control
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Inventory</h1>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/admin/suppliers" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Suppliers</Link><Link href="/admin/purchase-orders" className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700">Purchase orders</Link><Link href="/admin/inventory/batches" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Batches & expiry</Link></div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="Products" value={products.length} />
        <Metric label="Units on hand" value={units} />
        <Metric label="Low / out of stock" value={lowStock} alert={lowStock > 0} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[minmax(180px,1.5fr)_100px_90px_minmax(150px,1fr)_100px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid">
          <span>Product</span><span>Category</span><span>Stock</span><span>Threshold</span><span>Status</span>
        </div>
        <div className="divide-y divide-slate-200">
          {products.map((product) => {
            const stock = product.stock ?? 0;
            const minStock = product.minStock ?? 10;
            const maxStock = product.maxStock ?? 100;
            const status = stock === 0 ? "Out" : stock <= minStock ? "Low" : stock > maxStock ? "Over max" : "Healthy";
            return (
              <Link
                key={product.documentId}
                href={`/admin/products/${product.documentId}`}
                className="grid gap-3 px-4 py-4 hover:bg-slate-50 md:grid-cols-[minmax(180px,1.5fr)_100px_90px_minmax(150px,1fr)_100px] md:items-center md:gap-4"
              >
                <div>
                  <p className="font-semibold text-slate-950">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.sku ?? product.slug}</p>
                </div>
                <p className="text-sm capitalize text-slate-600">{product.category}</p>
                <p className="text-xl font-bold text-slate-950 md:text-sm">{stock}</p>
                <p className="text-sm text-slate-500">min {minStock} · max {maxStock}</p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${stock === 0 ? "bg-red-50 text-red-700" : stock <= minStock ? "bg-amber-50 text-amber-700" : stock > maxStock ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {status}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Recent stock movements</h2>
            <p className="mt-1 text-sm text-slate-500">Sales and manual adjustments are recorded automatically.</p>
          </div>
          <span className="text-sm font-semibold text-slate-500">Latest {Math.min(20, movements.length)}</span>
        </div>
        <div className="mt-4 divide-y divide-slate-200">
          {movements.slice(0, 20).map((movement) => (
            <div key={movement.documentId} className="grid gap-2 py-3 sm:grid-cols-[1.3fr_0.7fr_0.8fr_1fr] sm:items-center">
              <div>
                <p className="font-semibold text-slate-950">{movement.productName}</p>
                <p className="text-xs text-slate-500">{movement.sku || movement.slug}</p>
              </div>
              <p className={`font-bold ${movement.delta < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {movement.delta > 0 ? "+" : ""}{movement.delta} <span className="font-normal text-slate-400">→ {movement.balanceAfter}</span>
              </p>
              <p className="text-sm capitalize text-slate-600">{movement.reason.replaceAll("_", " ")}</p>
              <div className="text-sm sm:text-right">
                <p className="text-slate-700">{movement.reference || movement.actor}</p>
                <p className="text-xs text-slate-400">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(movement.createdAt))}</p>
              </div>
            </div>
          ))}
          {movements.length === 0 ? <p className="py-6 text-sm text-slate-500">No stock movement recorded yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${alert ? "text-red-600" : "text-slate-950"}`}>{value.toLocaleString()}</p>
    </div>
  );
}
