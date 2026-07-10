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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">
            Operations
          </p>
          <h1 className="mt-2 font-display text-4xl text-ink">Shop dashboard</h1>
        </div>
        <Link
          href="/admin/orders"
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream"
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
                className="flex items-center justify-between rounded-lg border border-clay bg-white px-4 py-3 hover:border-terracotta"
              >
                <div>
                  <p className="font-semibold text-ink">{order.orderNumber}</p>
                  <p className="text-sm text-stone">{order.email}</p>
                </div>
                <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-bark">
                  {order.status}
                </span>
              </Link>
            ))}
            {openOrders.length === 0 && <p className="text-sm text-stone">No open orders.</p>}
          </div>
        </Panel>

        <Panel title="Low stock" href="/admin/inventory">
          <div className="space-y-3">
            {lowStock.slice(0, 6).map((product) => (
              <Link
                key={product.documentId}
                href={`/admin/products/${product.documentId}`}
                className="flex items-center justify-between rounded-lg border border-clay bg-white px-4 py-3 hover:border-terracotta"
              >
                <div>
                  <p className="font-semibold text-ink">{product.name}</p>
                  <p className="text-sm text-stone">{product.category}</p>
                </div>
                <span className="rounded-full bg-terracotta/10 px-3 py-1 text-xs font-semibold text-terracotta-deep">
                  {product.stock ?? 0} left
                </span>
              </Link>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-stone">Inventory looks healthy.</p>}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-clay bg-cream p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone">{label}</p>
      <p className="mt-3 text-3xl font-bold text-ink">{value}</p>
      {detail && <p className="mt-1 text-sm text-stone">{detail}</p>}
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
    <section className="rounded-xl border border-clay bg-cream p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-terracotta">
          Open
        </Link>
      </div>
      {children}
    </section>
  );
}

