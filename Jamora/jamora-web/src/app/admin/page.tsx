import Link from "next/link";
import {
  formatAdminMoney,
  getAdminOrders,
  getAdminProducts,
  getAnalyticsSummary,
} from "@/lib/admin-api";

export default async function AdminDashboardPage() {
  const [summary, orders, products] = await Promise.all([
    getAnalyticsSummary(),
    getAdminOrders(),
    getAdminProducts(),
  ]);
  const openOrders = orders.filter((order) =>
    ["paid", "processing", "shipped"].includes(order.status),
  );
  const lowStock = products.filter((product) => (product.stock ?? 0) <= 10);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Operations
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Shop dashboard</h1>
        </div>
        <Link
          href="/admin/orders"
          className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          View orders
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Visits today" value={summary.visitsToday.toLocaleString()} />
        <Metric label="Sales" value={summary.sales.toLocaleString()} />
        <Metric label="Omzet" value={formatAdminMoney(summary.revenueCents)} />
        <Metric
          label="Est. profit"
          value={formatAdminMoney(summary.estimatedProfitCents)}
          detail={`${summary.estimatedMargin}% margin`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Orders to handle" href="/admin/shipping">
          <div className="space-y-3">
            {openOrders.slice(0, 6).map((order) => (
              <Link
                key={order.documentId}
                href={`/admin/orders/${order.documentId}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300"
              >
                <div>
                  <p className="font-semibold text-slate-950">{order.orderNumber}</p>
                  <p className="text-sm text-slate-500">{order.email}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {order.status}
                </span>
              </Link>
            ))}
            {openOrders.length === 0 && <p className="text-sm text-slate-500">No open orders.</p>}
          </div>
        </Panel>

        <Panel title="Low stock" href="/admin/inventory">
          <div className="space-y-3">
            {lowStock.slice(0, 6).map((product) => (
              <Link
                key={product.documentId}
                href={`/admin/products/${product.documentId}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300"
              >
                <div>
                  <p className="font-semibold text-slate-950">{product.name}</p>
                  <p className="text-sm text-slate-500">{product.category}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                  {product.stock ?? 0} left
                </span>
              </Link>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-slate-500">Inventory looks healthy.</p>}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
    </div>
  );
}

function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-blue-600">
          Open
        </Link>
      </div>
      {children}
    </section>
  );
}

