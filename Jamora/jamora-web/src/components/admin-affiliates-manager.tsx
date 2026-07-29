"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminAffiliate } from "@/lib/admin-api";

const empty = {
  name: "",
  email: "",
  code: "",
  discountType: "percentage",
  discountValue: 10,
  commissionRateBps: 1500,
  active: true,
};

export function AdminAffiliatesManager({ affiliates }: { affiliates: AdminAffiliate[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/admin/api/affiliates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create affiliate.");
      setDraft(empty);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create affiliate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold text-slate-950">Create affiliate</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
          <Field label="Email" value={draft.email} onChange={(value) => setDraft({ ...draft, email: value })} />
          <Field label="Code" value={draft.code} onChange={(value) => setDraft({ ...draft, code: value.toUpperCase().replace(/\s/g, "") })} />
          <NumberField label="Customer discount (%)" value={draft.discountValue} onChange={(value) => setDraft({ ...draft, discountValue: value })} />
          <NumberField label="Commission (%)" value={draft.commissionRateBps / 100} onChange={(value) => setDraft({ ...draft, commissionRateBps: Math.round(value * 100) })} />
        </div>
        <button type="button" disabled={saving || !draft.name || !draft.code} onClick={create} className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {saving ? "Creating..." : "Create affiliate"}
        </button>
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {affiliates.map((affiliate) => (
          <article key={affiliate.documentId} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-black text-blue-700">{affiliate.code}</p>
                <h3 className="mt-2 text-lg font-bold text-slate-950">{affiliate.name}</h3>
                <p className="text-sm text-slate-500">{affiliate.email || "No email"}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${affiliate.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {affiliate.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              Referral link: <span className="font-mono text-slate-900">/?ref={affiliate.code}</span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Stat label="Clicks" value={affiliate.clickCount ?? 0} />
              <Stat label="Conversions" value={affiliate.conversionCount ?? 0} />
              <Stat label="Commissions" value={affiliate.commissionCount ?? 0} />
              <Stat label="Pending" value={money(affiliate.pendingCommissionMinor)} />
              <Stat label="Approved" value={money(affiliate.approvedCommissionMinor)} />
              <Stat label="Paid" value={money(affiliate.paidCommissionMinor)} />
            </dl>
          </article>
        ))}
        {affiliates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
            No affiliates yet. Create one above, then share its referral link.
          </div>
        ) : null}
      </section>
    </div>
  );
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-950 outline-none focus:border-blue-500";

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<input type="number" min={0} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-slate-100 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-950">{value}</dd></div>;
}

function money(value = 0) {
  return `EUR ${(value / 100).toFixed(2)}`;
}
