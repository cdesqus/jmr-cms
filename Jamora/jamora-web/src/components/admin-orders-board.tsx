"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatAdminMoney,
  parseOrderItems,
  type AdminOrder,
  type AdminOrderStatus,
} from "@/lib/admin-api";

const STATUSES: AdminOrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "fulfilled",
  "failed",
  "refunded",
];

const NEXT_STATUS: Partial<Record<AdminOrderStatus, AdminOrderStatus>> = {
  pending: "paid",
  paid: "processing",
  processing: "shipped",
  shipped: "fulfilled",
};

const STATUS_STYLE: Record<AdminOrderStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  paid: "bg-blue-50 text-blue-700",
  processing: "bg-amber-50 text-amber-700",
  shipped: "bg-indigo-50 text-indigo-700",
  fulfilled: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  refunded: "bg-purple-50 text-purple-700",
};

export function AdminOrdersBoard({ orders }: { orders: AdminOrder[] }) {
  const router = useRouter();
  const [visible, setVisible] = useState<AdminOrderStatus | "all">("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const grouped = useMemo(() => {
    return STATUSES.map((status) => ({
      status,
      orders: orders.filter((order) => order.status === status),
    })).filter((group) => visible === "all" || group.status === visible);
  }, [orders, visible]);

  function selectedForStatus(status: AdminOrderStatus) {
    return orders.filter((order) => order.status === status && selected[order.documentId]);
  }

  async function advance(status: AdminOrderStatus) {
    const next = NEXT_STATUS[status];
    const targets = selectedForStatus(status);
    if (!next || targets.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        targets.map((order) =>
          fetch(`/admin/api/orders/${order.documentId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: next }),
          }),
        ),
      );
      setSelected({});
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        {(["all", ...STATUSES] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setVisible(status)}
            className={[
              "shrink-0 rounded-lg px-3 py-2 text-xs font-bold capitalize",
              visible === status ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {grouped.map((group) => {
          const checked = selectedForStatus(group.status);
          const next = NEXT_STATUS[group.status];
          return (
            <section key={group.status} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">
                    {group.status}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">{group.orders.length} orders</p>
                </div>
                {next ? (
                  <button
                    type="button"
                    onClick={() => void advance(group.status)}
                    disabled={saving || checked.length === 0}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Move {checked.length || ""} to {next}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="w-8 px-3 py-3"></th>
                      <th className="px-3 py-3">Order</th>
                      <th className="px-3 py-3">Info</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.orders.map((order) => {
                      const items = parseOrderItems(order.itemsSummary);
                      const labelUrl =
                        order.deliveryLabelUrl ??
                        (order.orderNumber
                          ? `/delivery-label/${encodeURIComponent(order.orderNumber)}`
                          : undefined);
                      return (
                        <tr key={order.documentId} className="align-top">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={Boolean(selected[order.documentId])}
                              onChange={(event) =>
                                setSelected((current) => ({
                                  ...current,
                                  [order.documentId]: event.target.checked,
                                }))
                              }
                              aria-label={`Select ${order.orderNumber}`}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Link href={`/admin/orders/${order.documentId}`} className="font-bold text-slate-950 hover:text-blue-700">
                              {order.orderNumber ?? order.documentId}
                            </Link>
                            <span className={["mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-bold capitalize", STATUS_STYLE[order.status]].join(" ")}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-slate-800">{order.customerName || "Customer"}</p>
                            <p className="max-w-[220px] truncate text-xs text-slate-500">{order.email}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {items.length} items · {formatAdminMoney(order.totalCents)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {order.trackingNumber || "No tracking"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex flex-col items-end gap-2">
                              <Link href={`/admin/orders/${order.documentId}`} className="text-xs font-bold text-blue-700">
                                Open
                              </Link>
                              {labelUrl ? (
                                <Link href={labelUrl} target="_blank" className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white">
                                  Print label
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {group.orders.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                          No orders in this status.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
