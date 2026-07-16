"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Supplier } from "@/lib/admin-api";

const EMPTY_FORM = { name: "", code: "", contactName: "", email: "", phone: "", country: "Indonesia", notes: "", active: true };

export function AdminSuppliersManager({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [open]);

  function closeModal() {
    if (saving) return;
    setOpen(false);
    setError("");
  }

  async function create() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/admin/api/operations/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create supplier.");
      setForm(EMPTY_FORM);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create supplier.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(supplier: Supplier) {
    await fetch(`/admin/api/operations/suppliers/${supplier.documentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...supplier, active: !supplier.active }),
    });
    router.refresh();
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{suppliers.length} production partner{suppliers.length === 1 ? "" : "s"}</p>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
        <span className="text-lg leading-none" aria-hidden="true">+</span>
        Add supplier
      </button>
    </div>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[1fr_1fr_0.7fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 md:grid">
        <span>Supplier</span><span>Contact</span><span>Country</span><span>Status</span>
      </div>
      <div className="divide-y divide-slate-100">
        {suppliers.map((supplier) => <article key={supplier.documentId} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1fr_0.7fr_auto] md:items-center">
          <div><p className="font-bold text-slate-950">{supplier.name}</p><p className="font-mono text-xs text-slate-500">{supplier.code}</p></div>
          <div><p className="text-sm text-slate-700">{supplier.contactName || "No contact"}</p><p className="text-xs text-slate-500">{supplier.email || supplier.phone || "No contact details"}</p></div>
          <p className="text-sm text-slate-600">{supplier.country || "-"}</p>
          <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${supplier.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{supplier.active ? "Active" : "Inactive"}</span><button type="button" onClick={() => toggle(supplier)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:border-blue-300 hover:text-blue-700">{supplier.active ? "Disable" : "Enable"}</button></div>
        </article>)}
        {suppliers.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-700">No suppliers yet</p><p className="mt-1 text-sm text-slate-500">Add a factory or production partner to start creating purchase orders.</p></div> : null}
      </div>
    </section>

    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="supplier-dialog-title" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Master data</p><h2 id="supplier-dialog-title" className="mt-1 text-2xl font-bold">Add supplier</h2><p className="mt-1 text-sm text-slate-500">Register a factory or production partner.</p></div>
          <button type="button" onClick={closeModal} aria-label="Close supplier form" title="Close" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500 hover:bg-slate-50">×</button>
        </header>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label="Supplier name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} autoFocus />
          <Field label="Code" value={form.code} onChange={(value) => setForm({ ...form, code: value.toUpperCase() })} />
          <Field label="Contact" value={form.contactName} onChange={(value) => setForm({ ...form, contactName: value })} />
          <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} className={`${inputClass} resize-y`} /></label>
          {error ? <p className="text-sm font-semibold text-red-600 sm:col-span-2">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={closeModal} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button>
          <button type="button" onClick={create} disabled={saving || !form.name || !form.code} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving..." : "Add supplier"}</button>
        </footer>
      </section>
    </div> : null}
  </div>;
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
function Field({ label, value, onChange, type = "text", autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoFocus?: boolean }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<input type={type} value={value} autoFocus={autoFocus} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}
