import { formatAdminMoney, getAnalyticsSummary, getBehaviorAnalytics } from "@/lib/admin-api";

export default async function AdminAnalyticsPage() {
  const [summary, behavior] = await Promise.all([getAnalyticsSummary(), getBehaviorAnalytics()]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Performance
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Analytics</h1>
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Metric label="Total visits" value={summary.visits.toLocaleString()} />
        <Metric label="Visits today" value={summary.visitsToday.toLocaleString()} />
        <Metric label="Sales" value={summary.sales.toLocaleString()} />
        <Metric label="Omzet" value={formatAdminMoney(summary.revenueCents)} />
        <Metric label="Today omzet" value={formatAdminMoney(summary.todayRevenueCents)} />
        <Metric
          label="Estimated profit"
          value={formatAdminMoney(summary.estimatedProfitCents)}
          detail={`${summary.estimatedMargin}% margin`}
        />
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Product funnel · last 30 days</h2>
        <p className="mt-1 text-sm text-slate-500">Deterministic event counts; AI insight is optional and never replaces these figures.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Views" value={behavior.totals.views.toLocaleString()} />
          <Metric label="Cart adds" value={behavior.totals.cartAdds.toLocaleString()} />
          <Metric label="Checkout starts" value={behavior.totals.checkoutStarts.toLocaleString()} />
          <Metric label="Purchases" value={behavior.totals.purchases.toLocaleString()} />
        </div>
        <div className="mt-5 divide-y divide-slate-100">{behavior.products.slice(0, 10).map((product) => <div key={product.productId} className="grid grid-cols-5 gap-2 py-3 text-sm"><span className="font-medium">{product.productId}</span><span>{product.views} views</span><span>{product.cartAdds} carts</span><span>{product.checkoutStarts} checkouts</span><span className="font-semibold">{product.purchases} sales</span></div>)}</div>
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
