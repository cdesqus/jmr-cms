"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminProduct } from "@/lib/admin-api";

function listToText(value?: string[]) {
  return Array.isArray(value) ? value.join("\n") : "";
}

export function AdminProductForm({ product }: { product: AdminProduct }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: product.name,
    slug: product.slug,
    botanical: product.botanical ?? "",
    category: product.category,
    priceCents: product.priceCents,
    stock: product.stock ?? 0,
    featured: product.featured ?? false,
    tagline: product.tagline ?? "",
    description: product.description ?? "",
    howToUse: product.howToUse ?? "",
    netWeight: product.netWeight ?? "",
    ingredients: listToText(product.ingredients),
    benefits: listToText(product.benefits),
    certifications: listToText(product.certifications),
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/admin/api/products/${product.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-clay bg-cream p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(v) => set("name", v)} />
        <Field label="Slug" value={form.slug} onChange={(v) => set("slug", v)} />
        <Field
          label="Botanical"
          value={form.botanical}
          onChange={(v) => set("botanical", v)}
        />
        <label className="text-sm font-semibold text-bark">
          Category
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value as typeof form.category)}
            className="mt-1 w-full rounded-lg border border-clay bg-white px-3 py-2 font-normal"
          >
            <option value="energy">Energy</option>
            <option value="digestion">Digestion</option>
            <option value="balance">Balance</option>
          </select>
        </label>
        <NumberField
          label="Price cents"
          value={form.priceCents}
          onChange={(v) => set("priceCents", v)}
        />
        <NumberField label="Stock" value={form.stock} onChange={(v) => set("stock", v)} />
        <Field
          label="Net weight"
          value={form.netWeight}
          onChange={(v) => set("netWeight", v)}
        />
        <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-bark">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => set("featured", e.target.checked)}
          />
          Featured product
        </label>
      </div>

      <Field label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} />
      <TextArea
        label="Description"
        value={form.description}
        onChange={(v) => set("description", v)}
      />
      <TextArea label="How to use" value={form.howToUse} onChange={(v) => set("howToUse", v)} />
      <div className="grid gap-4 md:grid-cols-3">
        <TextArea
          label="Ingredients"
          value={form.ingredients}
          onChange={(v) => set("ingredients", v)}
        />
        <TextArea label="Benefits" value={form.benefits} onChange={(v) => set("benefits", v)} />
        <TextArea
          label="Certifications"
          value={form.certifications}
          onChange={(v) => set("certifications", v)}
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save product"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-semibold text-bark">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-clay bg-white px-3 py-2 font-normal"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-semibold text-bark">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-clay bg-white px-3 py-2 font-normal"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-semibold text-bark">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-28 w-full rounded-lg border border-clay bg-white px-3 py-2 font-normal"
      />
    </label>
  );
}
