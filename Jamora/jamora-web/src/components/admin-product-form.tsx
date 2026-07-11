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
    minStock: product.minStock ?? 10,
    maxStock: product.maxStock ?? 100,
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
  const [uploading, setUploading] = useState(false);

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

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const uploadRes = await fetch("/admin/api/upload", {
        method: "POST",
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      const imageId = uploadJson.files?.[0]?.id;
      if (!uploadRes.ok || !imageId) throw new Error("Upload failed");
      await fetch(`/admin/api/products/${product.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(v) => set("name", v)} />
        <Field label="Slug" value={form.slug} onChange={(v) => set("slug", v)} />
        <Field
          label="Botanical"
          value={form.botanical}
          onChange={(v) => set("botanical", v)}
        />
        <label className="text-sm font-semibold text-slate-700">
          Category
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value as typeof form.category)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
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
        <NumberField
          label="Minimum stock alert"
          value={form.minStock}
          onChange={(v) => set("minStock", v)}
        />
        <NumberField
          label="Maximum stock"
          value={form.maxStock}
          onChange={(v) => set("maxStock", v)}
        />
        <Field
          label="Net weight"
          value={form.netWeight}
          onChange={(v) => set("netWeight", v)}
        />
        <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => set("featured", e.target.checked)}
          />
          Featured product
        </label>
      </div>

      <Field label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} />
      <label className="block text-sm font-semibold text-slate-700">
        Product photo
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadPhoto(file);
          }}
          className="mt-1 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-normal"
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {uploading ? "Uploading photo..." : "Upload replaces the current catalogue visual."}
        </span>
      </label>
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
        className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
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
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
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
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
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
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
      />
    </label>
  );
}
