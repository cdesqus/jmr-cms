"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminProduct } from "@/lib/admin-api";

export function AdminStockForm({ product }: { product: AdminProduct }) {
  const router = useRouter();
  const [stock, setStock] = useState(product.stock ?? 0);
  const [minStock, setMinStock] = useState(product.minStock ?? 10);
  const [maxStock, setMaxStock] = useState(product.maxStock ?? 100);
  const [reason, setReason] = useState("manual_adjustment");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const isLow = stock <= minStock;
  const isOver = stock > maxStock;

  async function save() {
    setSaving(true);
    try {
      await fetch(`/admin/api/products/${product.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stock,
          minStock,
          maxStock,
          stockReason: reason,
          stockReference: reference,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="Stock" value={stock} onChange={setStock} />
        <NumberField label="Min" value={minStock} onChange={setMinStock} />
        <NumberField label="Max" value={maxStock} onChange={setMaxStock} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p
          className={[
            "text-xs font-semibold",
            isLow ? "text-red-700" : isOver ? "text-amber-700" : "text-slate-500",
          ].join(" ")}
        >
          {isLow
            ? "Below minimum stock"
            : isOver
              ? "Above maximum stock"
              : "Stock level healthy"}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save stock"}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
        <label className="text-xs font-semibold text-slate-600">
          Adjustment reason
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal"
          >
            <option value="manual_adjustment">Manual adjustment</option>
            <option value="restock">Restock received</option>
            <option value="correction">Stock count correction</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Reference / note
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="PO number, stock count, or reason"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal"
          />
        </label>
      </div>
    </div>
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
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-950 outline-none focus:border-blue-500"
      />
    </label>
  );
}
