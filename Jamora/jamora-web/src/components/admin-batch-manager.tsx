"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminProduct, InventoryBatch } from "@/lib/admin-api";

export function AdminBatchManager({ products, batches }: { products: AdminProduct[]; batches: InventoryBatch[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    productDocumentId: products[0]?.documentId ?? "",
    batchNumber: "",
    quantity: 0,
    productionDate: "",
    expiryDate: "",
    certificateUrl: "",
    adjustProductStock: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function createBatch() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/admin/api/inventory-batches", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create batch.");
      setForm((current) => ({ ...current, batchNumber: "", quantity: 0, productionDate: "", expiryDate: "", certificateUrl: "" }));
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create batch."); }
    finally { setSaving(false); }
  }

  async function setStatus(batch: InventoryBatch, status: InventoryBatch["status"]) {
    await fetch(`/admin/api/inventory-batches/${batch.documentId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold text-slate-950">Receive batch</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>Product<select value={form.productDocumentId} onChange={(event) => setForm({ ...form, productDocumentId: event.target.value })} className={inputClass}>{products.map((product) => <option key={product.documentId} value={product.documentId}>{product.name}</option>)}</select></label>
          <Field label="Batch / lot number" value={form.batchNumber} onChange={(value) => setForm({ ...form, batchNumber: value.toUpperCase() })} />
          <label className={labelClass}>Quantity<input type="number" min={0} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} className={inputClass} /></label>
          <Field label="Production date" type="date" value={form.productionDate} onChange={(value) => setForm({ ...form, productionDate: value })} />
          <Field label="Expiry date" type="date" value={form.expiryDate} onChange={(value) => setForm({ ...form, expiryDate: value })} />
          <Field label="Certificate URL" value={form.certificateUrl} onChange={(value) => setForm({ ...form, certificateUrl: value })} />
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.adjustProductStock} onChange={(event) => setForm({ ...form, adjustProductStock: event.target.checked })} /> Add quantity to aggregate product stock</label>
        <button type="button" onClick={createBatch} disabled={saving || !form.productDocumentId || !form.batchNumber || !form.expiryDate} className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Receiving..." : "Receive batch"}</button>
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold text-slate-950">Batch availability</h2>
        <div className="mt-4 divide-y divide-slate-200">
          {batches.map((batch) => {
            const days = batch.daysUntilExpiry ?? 0;
            const available = Math.max(0, batch.quantity - batch.reservedQuantity);
            return <article key={batch.documentId} className="grid gap-3 py-4 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_auto] md:items-center">
              <div><p className="font-bold text-slate-950">{batch.productName}</p><p className="text-xs text-slate-500">{batch.batchNumber} · {batch.sku}</p></div>
              <div><p className="text-xs text-slate-400">Available</p><p className="font-bold">{available} <span className="font-normal text-slate-400">/ {batch.quantity}</span></p></div>
              <div><p className="text-xs text-slate-400">Reserved</p><p className="font-bold">{batch.reservedQuantity}</p></div>
              <div><p className="text-xs text-slate-400">Expiry</p><p className={`font-semibold ${days <= 30 ? "text-red-600" : days <= 90 ? "text-amber-600" : "text-slate-700"}`}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(batch.expiryDate))}</p><p className="text-xs text-slate-400">{days} days</p></div>
              <div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{batch.status}</span><button type="button" onClick={() => setStatus(batch, batch.status === "quarantined" ? "active" : "quarantined")} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold">{batch.status === "quarantined" ? "Release" : "Quarantine"}</button></div>
            </article>;
          })}
          {batches.length === 0 ? <p className="py-8 text-sm text-slate-500">No batch records yet. Legacy stock remains available for checkout.</p> : null}
        </div>
      </section>
    </div>
  );
}

const labelClass = "text-sm font-semibold text-slate-700";
const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500";
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className={labelClass}>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}
