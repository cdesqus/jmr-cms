import { useEffect, useState } from "react";
import { Widget } from "@strapi/admin/strapi-admin";

interface AnalyticsSummary {
  visits: number;
  visitsToday: number;
  sales: number;
  revenueCents: number;
  todayRevenueCents: number;
  estimatedProfitCents: number;
  estimatedMargin: number;
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export default function JamoraAnalyticsWidget() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch("/api/jamora/analytics/summary");
        if (!res.ok) throw new Error(`Analytics summary failed: ${res.status}`);
        const json = (await res.json()) as AnalyticsSummary;
        if (!ignore) setData(json);
      } catch {
        if (!ignore) setError(true);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  if (error) return <Widget.Error />;
  if (!data) return <Widget.Loading />;

  const metrics = [
    ["Visits", data.visits.toLocaleString("en-GB")],
    ["Visits today", data.visitsToday.toLocaleString("en-GB")],
    ["Sales", data.sales.toLocaleString("en-GB")],
    ["Omzet", formatEUR(data.revenueCents)],
    ["Today omzet", formatEUR(data.todayRevenueCents)],
    ["Est. profit", formatEUR(data.estimatedProfitCents)],
    ["Est. margin", `${data.estimatedMargin}%`],
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 12,
      }}
    >
      {metrics.map(([label, value]) => (
        <div
          key={label}
          style={{
            border: "1px solid #eaeaef",
            borderRadius: 8,
            padding: 12,
            background: "#fff",
          }}
        >
          <div style={{ color: "#666687", fontSize: 12, fontWeight: 600 }}>
            {label}
          </div>
          <div style={{ color: "#212134", fontSize: 20, fontWeight: 700 }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
