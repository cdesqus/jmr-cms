"use client";

import { useMemo, useState } from "react";
import type { AdminOrder } from "@/lib/admin-api";
import { formatAdminMoney } from "@/lib/admin-api";

type Range = "weekly" | "monthly";

function periodKey(date: Date, range: Range) {
  if (range === "monthly") {
    return new Intl.DateTimeFormat("en", { month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
}

function bucketOrders(orders: AdminOrder[], range: Range) {
  const days = range === "weekly" ? 7 : 30;
  const now = new Date();
  const buckets = Array.from({ length: days }).map((_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - index - 1));
    return {
      key: date.toISOString().slice(0, 10),
      label: periodKey(date, range),
      revenueCents: 0,
      sales: 0,
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const order of orders) {
    if (!order.createdAt || !["paid", "processing", "shipped", "fulfilled"].includes(order.status)) continue;
    const key = new Date(order.createdAt).toISOString().slice(0, 10);
    const bucket = byKey.get(key);
    if (!bucket) continue;
    bucket.revenueCents += order.totalCents ?? 0;
    bucket.sales += 1;
  }

  return buckets;
}

export function AdminDashboardChart({ orders }: { orders: AdminOrder[] }) {
  const [range, setRange] = useState<Range>("weekly");
  const buckets = useMemo(() => bucketOrders(orders, range), [orders, range]);
  const maxRevenue = Math.max(1, ...buckets.map((bucket) => bucket.revenueCents));
  const totalRevenue = buckets.reduce((sum, bucket) => sum + bucket.revenueCents, 0);
  const totalSales = buckets.reduce((sum, bucket) => sum + bucket.sales, 0);
  const width = 700;
  const height = 220;
  const padding = 18;
  const points = buckets.map((bucket, index) => {
    const x =
      padding +
      (index / Math.max(1, buckets.length - 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      (bucket.revenueCents / maxRevenue) * (height - padding * 2);
    return { ...bucket, x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Sales trend</h2>
          <p className="mt-1 text-sm text-slate-500">
            {formatAdminMoney(totalRevenue)} from {totalSales} paid orders
          </p>
        </div>
        <div className="rounded-lg bg-slate-100 p-1">
          {(["weekly", "monthly"] as Range[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-bold capitalize",
                range === item ? "bg-white text-blue-700 shadow-sm" : "text-slate-500",
              ].join(" ")}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 px-3 py-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full"
          role="img"
          aria-label="Sales line chart"
        >
          <defs>
            <linearGradient id="sales-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((line) => {
            const y = padding + (line / 3) * (height - padding * 2);
            return (
              <line
                key={line}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}
          <path d={areaPath} fill="url(#sales-area)" />
          <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => (
            <g key={`${point.key}-${index}`}>
              <circle cx={point.x} cy={point.y} r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
              <title>{`${point.label}: ${formatAdminMoney(point.revenueCents)}`}</title>
            </g>
          ))}
        </svg>
        <div className="mt-2 grid gap-2 text-[10px] font-semibold text-slate-500" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
          {buckets.map((bucket, index) => (
            <span key={bucket.key} className="truncate text-center">
              {range === "monthly" && index % 3 !== 0 ? "" : bucket.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
