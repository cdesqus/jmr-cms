"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NotificationLog, ReturnRequest } from "@/lib/admin-api";

const STATUSES: ReturnRequest["status"][] = ["requested", "approved", "rejected", "received", "refunded"];

export function AdminReturnsManager({ returns, notifications }: { returns: ReturnRequest[]; notifications: NotificationLog[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
      <section className="space-y-4">
        {returns.map((item) => <ReturnCard key={item.documentId} item={item} />)}
        {returns.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-sm text-slate-500">No return requests. Create one from an order detail page.</div> : null}
      </section>
      <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">Notification log</h2>
        <p className="mt-1 text-xs text-slate-500">Email events are simulated until an SMTP provider is configured.</p>
        <div className="mt-4 divide-y divide-slate-200">
          {notifications.slice(0, 12).map((notification) => <div key={notification.documentId} className="py-3"><p className="text-sm font-semibold text-slate-800">{notification.subject}</p><p className="mt-1 text-xs text-slate-500">{notification.recipient}</p><p className="mt-1 text-xs text-slate-400">{notification.status} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt))}</p></div>)}
          {notifications.length === 0 ? <p className="py-5 text-sm text-slate-500">No notification events yet.</p> : null}
        </div>
      </aside>
    </div>
  );
}

function ReturnCard({ item }: { item: ReturnRequest }) {
  const router = useRouter();
  const [status, setStatus] = useState(item.status);
  const [restock, setRestock] = useState(item.restock);
  const [adminNote, setAdminNote] = useState(item.adminNote ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/admin/api/returns/${item.documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, restock, adminNote }) });
      if (!response.ok) throw new Error("Could not update return.");
      router.refresh();
    } finally { setSaving(false); }
  }
  return <article className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-black text-blue-700">{item.returnNumber}</p><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{item.status}</span></div><p className="mt-2 font-bold text-slate-950">{item.orderNumber}</p><p className="text-sm text-slate-500">{item.email}</p></div><p className="max-w-md text-sm text-slate-600">{item.reason}</p></div>
    <div className="mt-4 flex flex-wrap gap-2">{item.items.map((line, index) => <span key={`${line.slug}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{line.name} × {line.qty}</span>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr]">
      <label className="text-xs font-semibold text-slate-600">Status<select value={status} onChange={(event) => setStatus(event.target.value as ReturnRequest["status"])} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal">{STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Admin note<input value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} disabled={item.restock} /> Restock items when marked received</label><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Update return"}</button></div>
  </article>;
}
