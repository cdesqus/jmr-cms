"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Category = "energy" | "digestion" | "balance";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("files", file);
  const res = await fetch("/admin/api/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Upload failed");
  const json = await res.json();
  return json.files?.[0]?.id as number | undefined;
}

export function AdminProductCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    botanical: "",
    category: "energy" as Category,
    priceCents: 0,
    stock: 100,
    minStock: 10,
    maxStock: 100,
    featured: false,
    tagline: "",
    netWeight: "30 sachets · 90 g",
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "name" && !current.slug ? { slug: slugify(String(value)) } : {}),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const imageId = file ? await uploadImage(file) : undefined;
      const res = await fetch("/admin/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, imageId }),
      });
      if (!res.ok) throw new Error("Create failed");
      router.push("/admin/products");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(v) => set("name", v)} />
        <Field label="Slug" value={form.slug} onChange={(v) => set("slug", slugify(v))} />
        <Field label="Botanical" value={form.botanical} onChange={(v) => set("botanical", v)} />
        <label className="text-sm font-semibold text-slate-700">
          Category
          <select
            value={form.category}
            onChange={(event) => set("category", event.target.value as Category)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
          >
            <option value="energy">Energy</option>
            <option value="digestion">Digestion</option>
            <option value="balance">Balance</option>
          </select>
        </label>
        <NumberField label="Price cents" value={form.priceCents} onChange={(v) => set("priceCents", v)} />
        <NumberField label="Stock" value={form.stock} onChange={(v) => set("stock", v)} />
        <NumberField label="Min stock" value={form.minStock} onChange={(v) => set("minStock", v)} />
        <NumberField label="Max stock" value={form.maxStock} onChange={(v) => set("maxStock", v)} />
        <Field label="Net weight" value={form.netWeight} onChange={(v) => set("netWeight", v)} />
        <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(event) => set("featured", event.target.checked)}
          />
          Featured product
        </label>
      </div>

      <Field label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} />
      <TextArea label="Description" value={form.description} onChange={(v) => set("description", v)} />
      <label className="block text-sm font-semibold text-slate-700">
        Product photo
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="mt-1 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-normal"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={saving || !form.name}
        className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {saving ? "Creating..." : "Create product"}
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
        onChange={(event) => onChange(event.target.value)}
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
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
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
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
      />
    </label>
  );
}
