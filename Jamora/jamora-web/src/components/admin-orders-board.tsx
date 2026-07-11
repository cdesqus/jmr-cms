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
  const filtered = useMemo(
    () => orders.filter((order) => visible === "all" || order.status === visible),
    [orders, visible],
  );
  const selectedOrders = orders.filter((order) => selected[order.documentId]);
  const selectedStatuses = Array.from(new Set(selectedOrders.map((order) => order.status)));
  const bulkSource = selectedStatuses.length === 1 ? selectedStatuses[0] : undefined;
  const bulkNext = bulkSource ? NEXT_STATUS[bulkSource] : undefined;

  function toggleAll(checked: boolean) {
    const next = { ...selected };
    for (const order of filtered) next[order.documentId] = checked;
    setSelected(next);
  }

  async function advanceSelected() {
    if (!bulkNext || selectedOrders.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        selectedOrders.map((order) =>
          fetch(`/admin/api/orders/${order.documentId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: bulkNext }),
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
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto">
            {(["all", ...STATUSES] as const).map((status) => {
              const count =
                status === "all"
                  ? orders.length
                  : orders.filter((order) => order.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setVisible(status)}
                  className={[
                    "shrink-0 rounded-lg px-3 py-2 text-xs font-bold capitalize",
                    visible === status
                      ? "bg-blue-600 text-white"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {status} <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">
              {selectedOrders.length} selected
            </span>
            <button
              type="button"
              onClick={() => void advanceSelected()}
              disabled={!bulkNext || saving}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {bulkNext ? `Move to ${bulkNext}` : "Select one status"}
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((order) => selected[order.documentId])}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all visible orders"
                />
              </th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Fulfilment</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((order) => {
              const items = parseOrderItems(order.itemsSummary);
              const labelUrl =
                order.deliveryLabelUrl ??
                (order.orderNumber
                  ? `/delivery-label/${encodeURIComponent(order.orderNumber)}`
                  : undefined);
              return (
                <tr key={order.documentId} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-4">
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
                  <td className="px-4 py-4">
                    <Link
                      href={`/admin/orders/${order.documentId}`}
                      className="font-bold text-slate-950 hover:text-blue-700"
                    >
                      {order.orderNumber ?? order.documentId}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.createdAt
                        ? new Intl.DateTimeFormat("en-GB", {
                            dateStyle: "medium",
                          }).format(new Date(order.createdAt))
                        : "No date"}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-800">
                      {order.customerName || "Customer"}
                    </p>
                    <p className="max-w-[220px] truncate text-xs text-slate-500">
                      {order.email}
                    </p>
                    <p className="mt-1 max-w-[260px] truncate text-xs text-slate-400">
                      {order.shippingAddressText || "No address"}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold capitalize",
                        STATUS_STYLE[order.status],
                      ].join(" ")}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-800">
                      {order.carrier || "Jamora EU Fulfilment"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.trackingNumber || "No tracking"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {items.length} item type{items.length === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-right font-bold">
                    {formatAdminMoney(order.totalCents)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/orders/${order.documentId}`}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                      >
                        Open
                      </Link>
                      {labelUrl ? (
                        <Link
                          href={labelUrl}
                          target="_blank"
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          Label
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No orders match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
