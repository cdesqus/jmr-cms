"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { AdminMembership, MembershipPlan, MembershipPlanInput } from "@/lib/membership-api";

const EMPTY: MembershipPlanInput = {
  name: "",
  active: true,
  durationMonths: 3,
  priceEurMinor: 1,
  priceRonMinor: 1,
  packageCredits: 1,
  eligibleProductSlugs: [],
};

export function AdminMembershipManager({
  plans,
  memberships,
  products,
}: {
  plans: MembershipPlan[];
  memberships: AdminMembership[];
  products: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string>();
  const [adjustingId, setAdjustingId] = useState<string>();
  const [creditDelta, setCreditDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function edit(plan: MembershipPlan) {
    setEditingId(plan.documentId);
    setDraft({
      name: plan.name,
      active: plan.active,
      durationMonths: plan.durationMonths,
      priceEurMinor: plan.priceEurMinor,
      priceRonMinor: plan.priceRonMinor,
      packageCredits: plan.packageCredits,
      eligibleProductSlugs: plan.eligibleProductSlugs,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await mutate(
      editingId ? `/admin/api/membership/plans/${encodeURIComponent(editingId)}` : "/admin/api/membership/plans",
      editingId ? "PATCH" : "POST",
      draft,
      editingId ? "Plan updated." : "Plan created.",
    );
    setEditingId(undefined);
    setDraft(EMPTY);
  }

  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!adjustingId) return;
    await mutate(
      `/admin/api/membership/memberships/${encodeURIComponent(adjustingId)}/adjust`,
      "POST",
      { creditDelta: Number(creditDelta), reason },
      "Credit adjustment posted.",
    );
    setAdjustingId(undefined);
    setCreditDelta("");
    setReason("");
  }

  async function expireDue() {
    await mutate("/admin/api/membership/memberships/expire-due", "POST", {}, "Due memberships processed.");
  }

  async function mutate(path: string, method: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Membership request failed.");
      setNotice(success);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Membership request failed.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold">{editingId ? "Edit plan" : "Create plan"}</h2>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(event) => void save(event)}>
          <Field label="Name"><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} /></Field>
          <Field label="Duration">
            <select value={draft.durationMonths} onChange={(e) => setDraft({ ...draft, durationMonths: Number(e.target.value) as 3 | 6 | 12 })} className={inputClass}>
              <option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option>
            </select>
          </Field>
          <Field label="EUR price (minor units)"><NumberInput value={draft.priceEurMinor} onChange={(value) => setDraft({ ...draft, priceEurMinor: value })} /></Field>
          <Field label="RON price (minor units)"><NumberInput value={draft.priceRonMinor} onChange={(value) => setDraft({ ...draft, priceRonMinor: value })} /></Field>
          <Field label="Package credits"><NumberInput value={draft.packageCredits} onChange={(value) => setDraft({ ...draft, packageCredits: value })} /></Field>
          <label className="flex items-end gap-2 pb-3 text-sm font-semibold">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active
          </label>
          <fieldset className="md:col-span-2">
            <legend className="text-sm font-semibold">Eligible products (at least one)</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => <label key={product.slug} className="flex gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.eligibleProductSlugs.includes(product.slug)}
                  onChange={(e) => setDraft({
                    ...draft,
                    eligibleProductSlugs: e.target.checked
                      ? [...draft.eligibleProductSlugs, product.slug]
                      : draft.eligibleProductSlugs.filter((slug) => slug !== product.slug),
                  })}
                />
                {product.name}
              </label>)}
            </div>
          </fieldset>
          <div className="flex gap-2 md:col-span-2">
            <button disabled={busy || draft.eligibleProductSlugs.length === 0} className={buttonClass}>{busy ? "Saving..." : editingId ? "Save changes" : "Create plan"}</button>
            {editingId ? <button type="button" onClick={() => { setEditingId(undefined); setDraft(EMPTY); }} className={secondaryButtonClass}>Cancel</button> : null}
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-bold">Plans</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => <article key={plan.documentId} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-bold">{plan.name}</h3><p className="text-sm text-slate-500">{plan.durationMonths} months · {plan.packageCredits} credits</p></div>
              <span className={plan.active ? "text-emerald-700" : "text-slate-500"}>{plan.active ? "Active" : "Inactive"}</span>
            </div>
            <p className="mt-3 text-sm">€{(plan.priceEurMinor / 100).toFixed(2)} reference · {formatMinor(plan.priceRonMinor)} RON</p>
            <p className="mt-2 text-xs text-slate-500">{plan.eligibleProductSlugs.join(", ")}</p>
            <button type="button" onClick={() => edit(plan)} className={`${secondaryButtonClass} mt-4`}>Edit</button>
          </article>)}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Members</h2>
          <button type="button" disabled={busy} onClick={() => void expireDue()} className={secondaryButtonClass}>Expire due memberships</button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
              <th className="p-3">Account</th><th className="p-3">Plan</th><th className="p-3">Period</th>
              <th className="p-3">Status</th><th className="p-3">Ledger balance</th><th className="p-3">Adjustments</th><th className="p-3" />
            </tr></thead>
            <tbody>{memberships.map((membership) => {
              const history = membership.adjustmentHistory ?? membership.creditEntries?.filter((entry) => entry.kind === "admin_adjustment") ?? [];
              return <tr key={membership.documentId} className="border-t border-slate-100 align-top">
                <td className="p-3"><span className="font-semibold">{membership.customerDocumentId}</span><br /><span className="text-xs text-slate-500">{membership.membershipNumber}</span></td>
                <td className="p-3">{membership.planSnapshot?.name ?? "Snapshot unavailable"}<br /><span className="text-xs text-slate-500">{membership.planSnapshot?.packageCredits ?? 0} credits</span></td>
                <td className="p-3">{formatDate(membership.startsAt)} – {formatDate(membership.endsAt)}</td>
                <td className="p-3">{membership.status.replaceAll("_", " ")}</td>
                <td className="p-3 font-bold">{membership.ledgerBalance ?? membership.cachedRemainingCredits ?? 0}</td>
                <td className="p-3">{history.length ? history.map((entry, index) => <div key={entry.entryId ?? index} className="mb-1 text-xs">{entry.creditDelta ?? entry.credits}: {entry.reason}</div>) : "—"}</td>
                <td className="p-3"><button type="button" onClick={() => setAdjustingId(membership.documentId)} className={secondaryButtonClass}>Adjust</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      {adjustingId ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <form onSubmit={(event) => void adjust(event)} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <h2 className="text-xl font-bold">Adjust credits</h2>
          <p className="mt-1 text-sm text-slate-500">Use a positive or negative whole number. A reason is required for the audit trail.</p>
          <div className="mt-4 space-y-4">
            <Field label="Credit change"><input required step={1} type="number" value={creditDelta} onChange={(e) => setCreditDelta(e.target.value)} className={inputClass} /></Field>
            <Field label="Reason"><textarea required value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} rows={3} /></Field>
          </div>
          <div className="mt-5 flex gap-2">
            <button disabled={busy || !reason.trim() || !Number.isSafeInteger(Number(creditDelta)) || Number(creditDelta) === 0} className={buttonClass}>Post adjustment</button>
            <button type="button" onClick={() => setAdjustingId(undefined)} className={secondaryButtonClass}>Cancel</button>
          </div>
        </form>
      </div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<span className="mt-1 block">{children}</span></label>;
}
function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input required min={1} step={1} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputClass} />;
}
function formatMinor(value: number) { return (value / 100).toFixed(2); }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "Pending"; }
const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";
const buttonClass = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50";
