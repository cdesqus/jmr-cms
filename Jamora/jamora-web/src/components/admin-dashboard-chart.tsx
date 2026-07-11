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
      <div className="mt-6 flex h-56 items-end gap-2 overflow-hidden border-b border-slate-200 pb-3">
        {buckets.map((bucket, index) => (
          <div key={`${bucket.key}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-44 w-full items-end rounded-t-md bg-slate-50">
              <div
                className="w-full rounded-t-md bg-blue-500 transition-all"
                style={{
                  height: `${Math.max(4, (bucket.revenueCents / maxRevenue) * 100)}%`,
                }}
                title={`${bucket.label}: ${formatAdminMoney(bucket.revenueCents)}`}
              />
            </div>
            <span className="max-w-full truncate text-[10px] font-semibold text-slate-500">
              {range === "monthly" && index % 3 !== 0 ? "" : bucket.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
