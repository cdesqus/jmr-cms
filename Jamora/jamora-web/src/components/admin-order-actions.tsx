"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseOrderItems, type AdminOrder, type AdminOrderStatus, type FulfilmentChecklistItem } from "@/lib/admin-api";

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
  const [note, setNote] = useState("");
  const [packedBy, setPackedBy] = useState(order.packedBy ?? "");
  const [checklist, setChecklist] = useState<FulfilmentChecklistItem[]>(
    Array.isArray(order.fulfilmentChecklist) && order.fulfilmentChecklist.length > 0
      ? order.fulfilmentChecklist
      : parseOrderItems(order).map((item) => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          checked: false,
        })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/admin/api/orders/${order.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, carrier, trackingNumber, note, packedBy, fulfilmentChecklist: checklist }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not update order.");
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-bold text-slate-950">Fulfilment controls</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminOrderStatus)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Carrier
          <input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Tracking number
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-semibold text-slate-700">
        Internal note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Packing issue, customer request, or handover note"
          className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
        />
      </label>
      <div className="mt-5 border-t border-slate-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-bold text-slate-950">Pick & pack checklist</h3><p className="text-xs text-slate-500">Verify every line before the parcel moves to shipped.</p></div>
          {order.packedAt ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Packed</span> : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {checklist.map((item, index) => (
            <label key={`${item.productId ?? item.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm">
              <input type="checkbox" checked={item.checked} onChange={(event) => setChecklist((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, checked: event.target.checked } : line))} />
              <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{item.name}</span><span className="text-xs text-slate-500">{item.sku || "No SKU"} · Qty {item.qty}</span></span>
            </label>
          ))}
        </div>
        <label className="mt-3 block max-w-sm text-sm font-semibold text-slate-700">Packed by<input value={packedBy} onChange={(event) => setPackedBy(event.target.value)} placeholder="Warehouse staff name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-5 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save fulfilment"}
      </button>
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
