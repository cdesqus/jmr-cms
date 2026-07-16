"use client";

import { useEffect, useMemo, useState } from "react";
import { buildFulfilmentChecklist, findPackingScanIndex, isPackingComplete } from "@/lib/packing";
import type { AdminOrder, AdminProduct, FulfilmentChecklistItem } from "@/lib/admin-api";

export function AdminPackingModal({ order, products, onClose, onSaved }: { order: AdminOrder; products: AdminProduct[]; onClose: () => void; onSaved: () => void }) {
  const [checklist, setChecklist] = useState<FulfilmentChecklistItem[]>(() => buildFulfilmentChecklist(order, products));
  const [packedBy, setPackedBy] = useState(order.packedBy ?? "");
  const [scanCode, setScanCode] = useState("");
  const [message, setMessage] = useState<{ text: string; matched: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const total = checklist.reduce((sum, item) => sum + item.qty, 0);
  const verified = checklist.reduce((sum, item) => sum + Math.min(item.qty, item.scannedQty ?? (item.checked ? item.qty : 0)), 0);
  const complete = isPackingComplete(checklist, packedBy);
  const progress = total > 0 ? Math.round((verified / total) * 100) : 0;
  const allocationCodes = useMemo(() => new Map((order.batchAllocations ?? []).map((allocation) => [allocation.name, allocation.batchNumber])), [order.batchAllocations]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape" && !saving) onClose(); }
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = ""; };
  }, [onClose, saving]);

  function scan() {
    const index = findPackingScanIndex(order, checklist, scanCode);
    if (index < 0) {
      setMessage({ text: `Code ${scanCode || "(empty)"} is not part of this order.`, matched: false });
      setScanCode("");
      return;
    }
    setChecklist((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const scannedQty = Math.min(item.qty, (item.scannedQty ?? 0) + 1);
      return { ...item, scannedQty, checked: scannedQty >= item.qty };
    }));
    setMessage({ text: `${checklist[index].name} verified.`, matched: true });
    setScanCode("");
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/admin/api/orders/${order.documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "processing", packedBy, fulfilmentChecklist: checklist }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not save packing progress.");
      onSaved();
    } catch (caught) {
      setMessage({ text: caught instanceof Error ? caught.message : "Could not save packing progress.", matched: false });
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="packing-title" className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between border-b border-slate-200 px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Warehouse packing</p><h2 id="packing-title" className="mt-1 text-2xl font-bold">{order.orderNumber}</h2><p className="mt-1 text-sm text-slate-500">{order.customerName} · {order.email}</p></div><button type="button" onClick={onClose} disabled={saving} title="Close" aria-label="Close packing" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500">×</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_220px] sm:items-end"><div><div className="flex justify-between text-sm"><span className="font-bold">Packing progress</span><span>{verified} / {total} units</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600 transition-[width]" style={{ width: `${progress}%` }} /></div></div><label className="text-sm font-bold text-slate-700">Packed by<input value={packedBy} onChange={(event) => setPackedBy(event.target.value)} placeholder="Warehouse staff name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500" /></label></div>
        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4"><label className="text-sm font-bold text-slate-800">Scan product SKU or batch barcode</label><p className="mt-1 text-xs text-slate-600">USB scanners type into this field automatically. For demo, type the expected code and press Enter.</p><div className="mt-3 flex gap-2"><input autoFocus value={scanCode} onChange={(event) => setScanCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); scan(); } }} placeholder="Scan code" className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-500" /><button type="button" onClick={scan} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Verify</button></div>{message ? <p className={`mt-2 text-xs font-bold ${message.matched ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p> : null}</div>
        <div className="mt-4 space-y-2">{checklist.map((item, index) => <div key={`${item.productId ?? item.name}-${index}`} className={`grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-center ${item.checked ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}><div><p className="font-bold text-slate-900">{item.name}</p><div className="mt-1 flex flex-wrap gap-2 text-xs"><span className="rounded bg-slate-100 px-2 py-1 font-mono">SKU: {item.sku || "missing"}</span>{allocationCodes.get(item.name) ? <span className="rounded bg-slate-100 px-2 py-1 font-mono">Batch: {allocationCodes.get(item.name)}</span> : null}</div></div><div className="flex items-center gap-3"><span className="text-sm font-bold">{item.scannedQty ?? 0} / {item.qty}</span><label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={item.checked} onChange={(event) => setChecklist((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, checked: event.target.checked, scannedQty: event.target.checked ? line.qty : 0 } : line))} />Manual verify</label></div></div>)}</div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4"><p className={`text-sm font-semibold ${complete ? "text-emerald-700" : "text-slate-500"}`}>{complete ? "Packing complete. This order is ready to ship." : "Verify all units and enter the packer name."}</p><div className="flex gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving..." : complete ? "Complete packing" : "Save progress"}</button></div></footer>
    </section>
  </div>;
}
