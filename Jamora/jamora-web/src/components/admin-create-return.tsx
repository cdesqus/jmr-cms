"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminOrder, AdminOrderItem } from "@/lib/admin-api";

export function AdminCreateReturn({ order, items }: { order: AdminOrder; items: AdminOrderItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/admin/api/returns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderDocumentId: order.documentId, items, reason }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create return.");
      router.push("/admin/returns");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create return."); }
    finally { setSaving(false); }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700">Create return</button>;
  return <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 sm:w-[420px]"><p className="text-sm font-bold text-slate-950">Create return for {order.orderNumber}</p><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for return" className="mt-3 min-h-20 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" /><div className="mt-3 flex gap-2"><button type="button" onClick={create} disabled={saving || !reason.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Creating..." : "Create RMA"}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold">Cancel</button></div>{error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}</div>;
}
