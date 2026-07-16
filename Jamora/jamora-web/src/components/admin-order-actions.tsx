"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type AdminOrder, type AdminOrderStatus, type AdminProduct, type FulfilmentChecklistItem } from "@/lib/admin-api";
import { buildFulfilmentChecklist, findPackingScanIndex } from "@/lib/packing";

const STATUSES: AdminOrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "fulfilled",
  "failed",
  "refunded",
];

export function AdminOrderActions({ order, products }: { order: AdminOrder; products: AdminProduct[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminOrderStatus>(order.status);
  const [carrier, setCarrier] = useState(order.carrier ?? "Jamora EU Fulfilment");
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? "");
  const [note, setNote] = useState("");
  const [packedBy, setPackedBy] = useState(order.packedBy ?? "");
  const [checklist, setChecklist] = useState<FulfilmentChecklistItem[]>(() => buildFulfilmentChecklist(order, products));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanMatched, setScanMatched] = useState<boolean | null>(null);

  function scan() {
    const code = scanCode.trim().toLowerCase();
    if (!code) return;
    const index = findPackingScanIndex(order, checklist, code);
    if (index < 0) {
      setScanMessage(`Code ${scanCode} does not match this order.`);
      setScanMatched(false);
      setScanCode("");
      return;
    }
    setChecklist((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const scannedQty = Math.min(item.qty, (item.scannedQty ?? 0) + 1);
      return { ...item, scannedQty, checked: scannedQty >= item.qty };
    }));
    setScanMessage(`${checklist[index].name} scanned.`);
    setScanMatched(true);
    setScanCode("");
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">Fulfilment details</h2><p className="mt-1 text-sm text-slate-500">Primary packing actions are available from the Orders workspace.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">{status}</span></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
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
      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">Manual status correction</summary>
        <label className="mt-3 block max-w-sm text-sm font-semibold text-slate-700">Status<select value={status} onChange={(event) => setStatus(event.target.value as AdminOrderStatus)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500">{STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </details>
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
          <div><h3 className="font-bold text-slate-950">Pick & pack checklist</h3><p className="text-xs text-slate-500">Scan each physical product before the parcel moves to shipped.</p></div>
          {order.packedAt ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Packed</span> : null}
        </div>
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <label className="text-sm font-bold text-slate-800">Product barcode or allocated batch</label>
          <p className="mt-1 text-xs text-slate-600">Use a USB barcode scanner, or type one of the expected codes shown below and press Enter.</p>
          <div className="mt-2 flex gap-2">
            <input autoFocus value={scanCode} onChange={(event) => setScanCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); scan(); } }} placeholder="Scan code and press Enter" className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-blue-500" />
            <button type="button" onClick={scan} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Scan</button>
          </div>
          {scanMessage ? <p className={`mt-2 text-xs font-semibold ${scanMatched ? "text-emerald-700" : "text-red-700"}`}>{scanMessage}</p> : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {checklist.map((item, index) => (
            <label key={`${item.productId ?? item.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm">
              <input type="checkbox" checked={item.checked} onChange={(event) => setChecklist((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, checked: event.target.checked, scannedQty: event.target.checked ? line.qty : 0 } : line))} />
              <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{item.name}</span>{item.sku ? <span className="block font-mono text-xs font-semibold text-blue-700">Scan: {item.sku}</span> : <span className="block text-xs font-semibold text-amber-700">SKU missing in product master</span>}<span className="text-xs text-slate-500">Verified {item.scannedQty ?? 0} / {item.qty}</span></span>
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
