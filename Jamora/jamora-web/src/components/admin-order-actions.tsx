"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminOrder, AdminOrderStatus } from "@/lib/admin-api";

const STATUSES: AdminOrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "fulfilled",
  "failed",
  "refunded",
];

export function AdminOrderActions({ order }: { order: AdminOrder }) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminOrderStatus>(order.status);
  const [carrier, setCarrier] = useState(order.carrier ?? "Jamora EU Fulfilment");
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/admin/api/orders/${order.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, carrier, trackingNumber }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-clay bg-cream p-5">
      <h2 className="font-display text-2xl text-ink">Fulfilment controls</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-semibold text-bark">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminOrderStatus)}
            className="mt-1 w-full rounded-lg border border-clay bg-white px-3 py-2 font-normal"
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-bark">
          Carrier
          <input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="mt-1 w-full rounded-lg border border-clay bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-semibold text-bark">
          Tracking number
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-clay bg-white px-3 py-2 font-normal"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-5 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save fulfilment"}
      </button>
    </div>
  );
}
