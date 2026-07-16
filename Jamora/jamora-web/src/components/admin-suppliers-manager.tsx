"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Supplier } from "@/lib/admin-api";

export function AdminSuppliersManager({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", code: "", contactName: "", email: "", phone: "", country: "Indonesia", notes: "", active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/admin/api/operations/suppliers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create supplier.");
      setForm({ name: "", code: "", contactName: "", email: "", phone: "", country: "Indonesia", notes: "", active: true }); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create supplier."); }
    finally { setSaving(false); }
  }

  async function toggle(supplier: Supplier) {
    await fetch(`/admin/api/operations/suppliers/${supplier.documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...supplier, active: !supplier.active }) });
    router.refresh();
  }

  return <div className="space-y-6">
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Add supplier</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Supplier name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Field label="Code" value={form.code} onChange={(value) => setForm({ ...form, code: value.toUpperCase() })} /><Field label="Contact" value={form.contactName} onChange={(value) => setForm({ ...form, contactName: value })} /><Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} /><Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} /><Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} /></div><button type="button" onClick={create} disabled={saving || !form.name || !form.code} className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving..." : "Add supplier"}</button>{error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}</section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="divide-y divide-slate-100">{suppliers.map((supplier) => <article key={supplier.documentId} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1fr_0.7fr_auto] md:items-center"><div><p className="font-bold text-slate-950">{supplier.name}</p><p className="text-xs font-mono text-slate-500">{supplier.code}</p></div><div><p className="text-sm text-slate-700">{supplier.contactName || "No contact"}</p><p className="text-xs text-slate-500">{supplier.email || supplier.phone || "No contact details"}</p></div><p className="text-sm text-slate-600">{supplier.country || "-"}</p><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${supplier.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{supplier.active ? "Active" : "Inactive"}</span><button type="button" onClick={() => toggle(supplier)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">{supplier.active ? "Disable" : "Enable"}</button></div></article>)}{suppliers.length === 0 ? <p className="p-8 text-sm text-slate-500">No suppliers yet.</p> : null}</div></section>
  </div>;
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-blue-500";
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-sm font-semibold text-slate-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
