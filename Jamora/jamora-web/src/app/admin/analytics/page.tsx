import { formatAdminMoney, getAnalyticsSummary } from "@/lib/admin-api";

export default async function AdminAnalyticsPage() {
  const summary = await getAnalyticsSummary();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">
          Performance
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">Analytics</h1>
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

