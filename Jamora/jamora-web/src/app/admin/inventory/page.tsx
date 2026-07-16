import Link from "next/link";
import {
  getAdminOrders,
  getAdminProducts,
  getInventoryMovements,
  getPurchaseOrders,
  parseOrderItems,
} from "@/lib/admin-api";
import {
  buildInventoryProjection,
  getInventoryHealth,
} from "@/lib/inventory-projection.cjs";

export default async function AdminInventoryPage() {
  const [products, movements, orders, purchaseOrders] = await Promise.all([
    getAdminProducts().catch(() => []),
    getInventoryMovements().catch(() => []),
    getAdminOrders().catch(() => []),
    getPurchaseOrders().catch(() => []),
  ]);
  const projection = buildInventoryProjection(
    products,
    orders.map((order) => ({ ...order, items: parseOrderItems(order) })),
    purchaseOrders,
  );
  const projectionByProduct = new Map(
    projection.rows.map((row) => [row.productDocumentId, row]),
  );
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
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/suppliers" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Suppliers</Link>
          <Link href="/admin/purchase-orders" className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700">Purchase orders</Link>
          <Link href="/admin/receiving" className="rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-sm font-bold text-emerald-700">Receiving</Link>
          <Link href="/admin/inventory/batches" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Batches & expiry</Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="On hand" value={projection.totals.onHand} />
        <Metric label="Allocated" value={projection.totals.allocated} />
        <Metric label="Available" value={projection.totals.available} />
        <Metric label="Incoming" value={projection.totals.incoming} accent />
        <Metric label="Projected" value={projection.totals.projected} />
        <Metric label="Low / out" value={lowStock} alert={lowStock > 0} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[minmax(150px,1.5fr)_repeat(5,minmax(62px,0.55fr))_minmax(105px,0.8fr)_85px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 lg:grid">
          <span>Product</span>
          <span>On hand</span>
          <span>Allocated</span>
          <span>Available</span>
          <span>Incoming</span>
          <span>Projected</span>
          <span>Threshold</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-slate-200">
          {products.map((product) => {
            const stock = projectionByProduct.get(product.documentId) ?? {
              onHand: 0,
              allocated: 0,
              available: 0,
              incoming: 0,
              projected: 0,
            };
            const minStock = product.minStock ?? 10;
            const maxStock = product.maxStock ?? 100;
            const status = getInventoryHealth({
              available: stock.available,
              incoming: stock.incoming,
              projected: stock.projected,
              minStock,
              maxStock,
            });
            return (
              <Link
                key={product.documentId}
                href={`/admin/products/${product.documentId}`}
                className="grid gap-4 px-4 py-4 hover:bg-slate-50 lg:grid-cols-[minmax(150px,1.5fr)_repeat(5,minmax(62px,0.55fr))_minmax(105px,0.8fr)_85px] lg:items-center lg:gap-3"
              >
                <div>
                  <p className="font-semibold text-slate-950">{product.name}</p>
                  <p className="text-xs capitalize text-slate-500">{product.sku ?? product.slug} - {product.category}</p>
                </div>
                <StockValue label="On hand" value={stock.onHand} />
                <StockValue label="Allocated" value={stock.allocated} />
                <StockValue label="Available" value={stock.available} strong />
                <StockValue label="Incoming" value={stock.incoming} accent />
                <StockValue label="Projected" value={stock.projected} />
                <p className="text-sm text-slate-500">min {minStock} - max {maxStock}</p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${healthClass(status)}`}>
                  {status}
                </span>
              </Link>
            );
          })}
          {products.length === 0 ? <p className="px-4 py-8 text-sm text-slate-500">No products available.</p> : null}
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
                {movement.delta > 0 ? "+" : ""}{movement.delta} <span className="font-normal text-slate-400">to {movement.balanceAfter}</span>
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

function healthClass(status: string) {
  if (status === "Out") return "bg-red-50 text-red-700";
  if (status === "Low") return "bg-amber-50 text-amber-700";
  if (status === "Restocking") return "bg-blue-50 text-blue-700";
  if (status === "Over max") return "bg-violet-50 text-violet-700";
  return "bg-emerald-50 text-emerald-700";
}

function StockValue({ label, value, strong = false, accent = false }: { label: string; value: number; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 lg:block">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 lg:hidden">{label}</span>
      <span className={`text-sm ${strong ? "font-bold text-slate-950" : accent ? "font-semibold text-blue-700" : "font-medium text-slate-700"}`}>{value.toLocaleString()}</span>
    </div>
  );
}

function Metric({ label, value, alert = false, accent = false }: { label: string; value: number; alert?: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${accent ? "border-blue-200" : "border-slate-200"}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${alert ? "text-red-600" : accent ? "text-blue-700" : "text-slate-950"}`}>{value.toLocaleString()}</p>
    </div>
  );
}
