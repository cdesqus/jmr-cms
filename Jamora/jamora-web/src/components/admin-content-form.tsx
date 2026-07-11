"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoreContent } from "@/lib/admin-api";
import { mergeStoreContent } from "@/lib/store-content";

function listToText(value?: string[]) {
  return Array.isArray(value) ? value.join("\n") : "";
}

export function AdminContentForm({ content }: { content: StoreContent }) {
  const router = useRouter();
  const merged = mergeStoreContent(content);
  const [form, setForm] = useState({
    ...merged,
    certifications: listToText(merged.certifications),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/admin/api/content", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      setMessage("Saved. Storefront cache refreshed.");
      router.refresh();
    } catch {
      setMessage("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">Homepage hero</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Eyebrow" value={form.heroEyebrow} onChange={(v) => set("heroEyebrow", v)} />
          <Field label="Title" value={form.heroTitle} onChange={(v) => set("heroTitle", v)} />
          <Field
            label="Highlighted title"
            value={form.heroHighlight}
            onChange={(v) => set("heroHighlight", v)}
          />
          <Field
            label="Primary CTA"
            value={form.primaryCtaLabel}
            onChange={(v) => set("primaryCtaLabel", v)}
          />
          <Field
            label="Secondary CTA"
            value={form.secondaryCtaLabel}
            onChange={(v) => set("secondaryCtaLabel", v)}
          />
        </div>
        <TextArea
          label="Description"
          value={form.heroDescription}
          onChange={(v) => set("heroDescription", v)}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">Romanian homepage</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Eyebrow RO" value={form.heroEyebrowRo} onChange={(v) => set("heroEyebrowRo", v)} />
          <Field label="Title RO" value={form.heroTitleRo} onChange={(v) => set("heroTitleRo", v)} />
          <Field
            label="Highlighted title RO"
            value={form.heroHighlightRo}
            onChange={(v) => set("heroHighlightRo", v)}
          />
          <Field
            label="Primary CTA RO"
            value={form.primaryCtaLabelRo}
            onChange={(v) => set("primaryCtaLabelRo", v)}
          />
          <Field
            label="Secondary CTA RO"
            value={form.secondaryCtaLabelRo}
            onChange={(v) => set("secondaryCtaLabelRo", v)}
          />
        </div>
        <TextArea
          label="Description RO"
          value={form.heroDescriptionRo}
          onChange={(v) => set("heroDescriptionRo", v)}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">Sections</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Pillars eyebrow" value={form.pillarsEyebrow} onChange={(v) => set("pillarsEyebrow", v)} />
          <Field label="Pillars title" value={form.pillarsTitle} onChange={(v) => set("pillarsTitle", v)} />
          <Field label="Featured eyebrow" value={form.featuredEyebrow} onChange={(v) => set("featuredEyebrow", v)} />
          <Field label="Featured title" value={form.featuredTitle} onChange={(v) => set("featuredTitle", v)} />
          <Field label="Story eyebrow" value={form.storyEyebrow} onChange={(v) => set("storyEyebrow", v)} />
          <Field label="Story title" value={form.storyTitle} onChange={(v) => set("storyTitle", v)} />
        </div>
        <TextArea
          label="Story description"
          value={form.storyDescription}
          onChange={(v) => set("storyDescription", v)}
        />
        <TextArea
          label="Certifications, one per line"
          value={form.certifications}
          onChange={(v) => set("certifications", v)}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">Romanian sections</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Pillars eyebrow RO" value={form.pillarsEyebrowRo} onChange={(v) => set("pillarsEyebrowRo", v)} />
          <Field label="Pillars title RO" value={form.pillarsTitleRo} onChange={(v) => set("pillarsTitleRo", v)} />
          <Field label="Featured eyebrow RO" value={form.featuredEyebrowRo} onChange={(v) => set("featuredEyebrowRo", v)} />
          <Field label="Featured title RO" value={form.featuredTitleRo} onChange={(v) => set("featuredTitleRo", v)} />
          <Field label="Story eyebrow RO" value={form.storyEyebrowRo} onChange={(v) => set("storyEyebrowRo", v)} />
          <Field label="Story title RO" value={form.storyTitleRo} onChange={(v) => set("storyTitleRo", v)} />
        </div>
        <TextArea
          label="Story description RO"
          value={form.storyDescriptionRo}
          onChange={(v) => set("storyDescriptionRo", v)}
        />
      </section>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {saving ? "Saving content..." : "Save content"}
      </button>
      {message ? (
        <p className="text-sm font-semibold text-slate-500">{message}</p>
      ) : null}
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
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-blue-500"
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
    <label className="mt-4 block text-sm font-semibold text-slate-700">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-blue-500"
      />
    </label>
  );
}
