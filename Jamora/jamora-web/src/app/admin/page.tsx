import Link from "next/link";
import {
  formatAdminMoney,
  getAdminOrders,
  getAdminCustomers,
  getAdminProducts,
  getAnalyticsSummary,
  getInventoryBatches,
} from "@/lib/admin-api";
import { getAdminIdentity } from "@/lib/admin-session";
import { AdminDashboardChart } from "@/components/admin-dashboard-chart";
import type { AdminOrder, AdminProduct, AnalyticsSummary, InventoryBatch } from "@/lib/admin-api";

const EMPTY_SUMMARY: AnalyticsSummary = {
  visits: 0,
  visitsToday: 0,
  sales: 0,
  revenueCents: 0,
  todayRevenueCents: 0,
  estimatedProfitCents: 0,
  estimatedMargin: 0,
};

async function safe<T>(loader: () => Promise<T>, fallback: T) {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

export default async function AdminDashboardPage() {
  const identity = await getAdminIdentity();
  const [summary, orders, products, batches, customers] = await Promise.all([
    safe(getAnalyticsSummary, EMPTY_SUMMARY),
    safe<AdminOrder[]>(getAdminOrders, []),
    safe<AdminProduct[]>(getAdminProducts, []),
    safe<InventoryBatch[]>(getInventoryBatches, []),
    safe(getAdminCustomers, []),
  ]);
  const openOrders = orders.filter((order) =>
    ["paid", "processing", "shipped"].includes(order.status),
  );
  const revenueOrders = orders.filter((order) =>
    ["paid", "processing", "shipped", "fulfilled"].includes(order.status),
  );
  const revenueCents = revenueOrders.reduce(
    (sum, order) => sum + (order.totalCents ?? 0),
    0,
  );
  const estimatedProfitCents = revenueOrders.reduce((sum, order) => {
    if (typeof order.estimatedProfitCents === "number") {
      return sum + order.estimatedProfitCents;
    }
    return sum + Math.round((order.totalCents ?? 0) * 0.58);
  }, 0);
  const estimatedMargin =
    revenueCents > 0 ? Math.round((estimatedProfitCents / revenueCents) * 1000) / 10 : 0;
  const lowStock = products.filter(
    (product) => (product.stock ?? 0) <= (product.minStock ?? 10),
  );
  const expiringBatches = batches.filter((batch) => {
    return batch.status === "active" && (batch.daysUntilExpiry ?? Number.POSITIVE_INFINITY) <= 90;
  });

  if (identity && identity.role !== "owner") {
    const units = products.reduce((sum, product) => sum + (product.stock ?? 0), 0);
    const featured = products.filter((product) => product.featured).length;
    const roleData = identity.role === "warehouse"
      ? {
          title: "Warehouse workspace",
          description: "Receive production, control stock, and fulfil customer orders.",
          metrics: [["Orders to handle", openOrders.length], ["Units on hand", units], ["Low stock", lowStock.length], ["Expiry alerts", expiringBatches.length]] as const,
          links: [["Open orders", "/admin/orders"], ["Inventory", "/admin/inventory"], ["Receiving", "/admin/receiving"], ["Purchase orders", "/admin/purchase-orders"]] as const,
        }
      : identity.role === "content"
        ? {
            title: "Content workspace",
            description: "Maintain the catalogue, campaigns, and storefront copy.",
            metrics: [["Products", products.length], ["Featured products", featured]] as const,
            links: [["Products", "/admin/products"], ["Create product", "/admin/products/new"], ["Promotions", "/admin/promotions"], ["Storefront content", "/admin/content"]] as const,
          }
        : {
            title: "Customer support workspace",
            description: "Find customers, follow orders, and resolve return requests.",
            metrics: [["Customers", customers.length], ["Open orders", openOrders.length], ["Shipped", orders.filter((order) => order.status === "shipped").length]] as const,
            links: [["Orders", "/admin/orders"], ["Customers", "/admin/customers"], ["Returns", "/admin/returns"]] as const,
          };
    return <RoleDashboard title={roleData.title} description={roleData.description} metrics={roleData.metrics} links={roleData.links} />;
  }

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
        <Metric label="Sales" value={revenueOrders.length.toLocaleString()} />
        <Metric label="Omzet" value={formatAdminMoney(revenueCents)} />
        <Metric
          label="Est. profit"
          value={formatAdminMoney(estimatedProfitCents)}
          detail={`${estimatedMargin}% margin`}
        />
      </section>

      <AdminDashboardChart orders={orders} />

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Orders to handle" href="/admin/orders">
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
                  <p className="text-sm text-slate-500">
                    min {product.minStock ?? 10} · max {product.maxStock ?? 100}
                  </p>
                </div>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                  {product.stock ?? 0} left
                </span>
              </Link>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-slate-500">Inventory looks healthy.</p>}
          </div>
        </Panel>

        <Panel title="Expiry alerts" href="/admin/inventory/batches">
          <div className="space-y-3">
            {expiringBatches.slice(0, 6).map((batch) => (
              <Link key={batch.documentId} href="/admin/inventory/batches" className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300">
                <div><p className="font-semibold text-slate-950">{batch.productName}</p><p className="text-sm text-slate-500">{batch.batchNumber}</p></div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(batch.expiryDate))}</span>
              </Link>
            ))}
            {expiringBatches.length === 0 ? <p className="text-sm text-slate-500">No batches expire within 90 days.</p> : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function RoleDashboard({ title, description, metrics, links }: { title: string; description: string; metrics: readonly (readonly [string, number])[]; links: readonly (readonly [string, string])[] }) {
  return <div className="space-y-8"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Operations</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-2 text-sm text-slate-500">{description}</p></div><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value.toLocaleString()} />)}</section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Quick actions</h2><div className="mt-4 flex flex-wrap gap-3">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">{label}</Link>)}</div></section></div>;
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
