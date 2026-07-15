"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminProduct, AdminPromotion } from "@/lib/admin-api";

type PromotionDraft = Omit<AdminPromotion, "documentId" | "createdAt" | "updatedAt" | "usageCount">;

const EMPTY: PromotionDraft = {
  name: "",
  code: "",
  discountType: "percentage",
  discountValue: 10,
  startsAt: null,
  endsAt: null,
  usageLimit: 0,
  minimumSpendCents: 0,
  productSlugs: [],
  active: true,
};

export function AdminPromotionsManager({
  promotions,
  products,
}: {
  promotions: AdminPromotion[];
  products: AdminProduct[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function create(draft: PromotionDraft) {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/admin/api/promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(draft)),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create promotion.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create promotion.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-950">Create coupon</h2>
          <p className="mt-1 text-sm text-slate-500">Leave products empty to apply the coupon to the entire catalogue.</p>
        </div>
        <PromotionForm
          initial={EMPTY}
          products={products}
          submitLabel={creating ? "Creating..." : "Create coupon"}
          disabled={creating}
          onSubmit={create}
        />
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-950">Campaigns</h2>
          <span className="text-sm text-slate-500">{promotions.length} coupon{promotions.length === 1 ? "" : "s"}</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {promotions.map((promotion) => (
            <PromotionCard key={promotion.documentId} promotion={promotion} products={products} />
          ))}
          {promotions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
              No promotions yet. Create the first coupon above.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PromotionCard({ promotion, products }: { promotion: AdminPromotion; products: AdminProduct[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const exhausted = (promotion.usageLimit ?? 0) > 0 && (promotion.usageCount ?? 0) >= (promotion.usageLimit ?? 0);

  async function update(draft: PromotionDraft) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/admin/api/promotions/${promotion.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(draft)),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not update promotion.");
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update promotion.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    await update({ ...promotion, active: !promotion.active });
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-blue-50 px-3 py-1 font-mono text-sm font-black text-blue-700">{promotion.code}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${promotion.active && !exhausted ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {exhausted ? "Limit reached" : promotion.active ? "Active" : "Inactive"}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-950">{promotion.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {promotion.discountType === "percentage" ? `${promotion.discountValue}% off` : `EUR ${(promotion.discountValue / 100).toFixed(2)} off`}
            {promotion.minimumSpendCents ? ` · min EUR ${(promotion.minimumSpendCents / 100).toFixed(2)}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Used {promotion.usageCount ?? 0}{promotion.usageLimit ? ` of ${promotion.usageLimit}` : " times · unlimited"}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
            {editing ? "Close" : "Edit"}
          </button>
          <button type="button" onClick={toggle} disabled={saving} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {promotion.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
      {editing ? (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <PromotionForm
            initial={promotion}
            products={products}
            submitLabel={saving ? "Saving..." : "Save changes"}
            disabled={saving}
            onSubmit={update}
          />
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
    </article>
  );
}

function PromotionForm({
  initial,
  products,
  onSubmit,
  submitLabel,
  disabled,
}: {
  initial: PromotionDraft;
  products: AdminProduct[];
  onSubmit: (draft: PromotionDraft) => Promise<void>;
  submitLabel: string;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<PromotionDraft>({ ...initial, productSlugs: initial.productSlugs ?? [] });
  function set<K extends keyof PromotionDraft>(key: K, value: PromotionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function toggleProduct(slug: string) {
    set("productSlugs", (draft.productSlugs ?? []).includes(slug)
      ? (draft.productSlugs ?? []).filter((item) => item !== slug)
      : [...(draft.productSlugs ?? []), slug]);
  }
  async function submit() {
    await onSubmit(draft);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Campaign name" value={draft.name} onChange={(value) => set("name", value)} />
        <Field label="Coupon code" value={draft.code} onChange={(value) => set("code", value.toUpperCase().replace(/\s/g, ""))} />
        <label className="text-sm font-semibold text-slate-700">Discount type
          <select value={draft.discountType} onChange={(event) => set("discountType", event.target.value as PromotionDraft["discountType"])} className={inputClass}>
            <option value="percentage">Percentage</option><option value="fixed">Fixed amount</option>
          </select>
        </label>
        <NumberField label={draft.discountType === "percentage" ? "Discount (%)" : "Discount (EUR)"} value={draft.discountType === "percentage" ? draft.discountValue : draft.discountValue / 100} step={draft.discountType === "percentage" ? 1 : 0.01} onChange={(value) => set("discountValue", draft.discountType === "percentage" ? value : Math.round(value * 100))} />
        <NumberField label="Minimum spend (EUR)" value={(draft.minimumSpendCents ?? 0) / 100} step={0.01} onChange={(value) => set("minimumSpendCents", Math.round(value * 100))} />
        <NumberField label="Usage limit (0 = unlimited)" value={draft.usageLimit ?? 0} step={1} onChange={(value) => set("usageLimit", value)} />
        <Field label="Starts at" type="datetime-local" value={dateInput(draft.startsAt)} onChange={(value) => set("startsAt", value || null)} />
        <Field label="Ends at" type="datetime-local" value={dateInput(draft.endsAt)} onChange={(value) => set("endsAt", value || null)} />
        <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.active} onChange={(event) => set("active", event.target.checked)} /> Active
        </label>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Eligible products</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <label key={product.documentId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={(draft.productSlugs ?? []).includes(product.slug)} onChange={() => toggleProduct(product.slug)} />
              <span className="truncate">{product.name}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">No selection means all products.</p>
      </div>
      <button type="button" onClick={submit} disabled={disabled || !draft.name || !draft.code} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
        {submitLabel}
      </button>
    </div>
  );
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-950 outline-none focus:border-blue-500";

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}

function NumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (value: number) => void; step: number }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<input type="number" min={0} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>;
}

function dateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 16) : date.toISOString().slice(0, 16);
}

function toPayload(draft: PromotionDraft) {
  return {
    ...draft,
    startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
    endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
    usageLimit: Math.max(0, Math.round(draft.usageLimit ?? 0)),
  };
}
