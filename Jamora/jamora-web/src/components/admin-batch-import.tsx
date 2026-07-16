"use client";

import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ImportRow {
  sku: string;
  slug?: string;
  batchNumber: string;
  quantity: number;
  productionDate: string;
  expiryDate: string;
  certificateUrl?: string;
  supplierName?: string;
  purchaseOrderNumber?: string;
}

const SAMPLE = "sku,batchNumber,quantity,productionDate,expiryDate,certificateUrl,supplierName,purchaseOrderNumber\nJM-KENCURCALM,BATCH-2026-001,50,2026-07-01,2028-07-01,https://example.com/cert.pdf,Java Herbal Factory,PO-2026-001";

export function AdminBatchImport() {
  const router = useRouter();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function loadFile(file?: File) {
    if (!file) return;
    setFileName(file.name); setMessage(""); setErrors([]);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        const parsed = result.data.map((row) => ({
          sku: (row.sku ?? "").trim(),
          slug: (row.slug ?? "").trim(),
          batchNumber: (row.batchNumber ?? "").trim().toUpperCase(),
          quantity: Number(row.quantity),
          productionDate: (row.productionDate ?? "").trim(),
          expiryDate: (row.expiryDate ?? "").trim(),
          certificateUrl: (row.certificateUrl ?? "").trim(),
          supplierName: (row.supplierName ?? "").trim(),
          purchaseOrderNumber: (row.purchaseOrderNumber ?? "").trim().toUpperCase(),
        }));
        const validation = parsed.flatMap((row, index) => {
          const rowErrors: string[] = [];
          if (!row.sku && !row.slug) rowErrors.push(`Row ${index + 1}: SKU or slug is required.`);
          if (!row.batchNumber) rowErrors.push(`Row ${index + 1}: batchNumber is required.`);
          if (!Number.isFinite(row.quantity) || row.quantity <= 0) rowErrors.push(`Row ${index + 1}: quantity must be greater than zero.`);
          if (!row.productionDate || !row.expiryDate) rowErrors.push(`Row ${index + 1}: productionDate and expiryDate are required.`);
          return rowErrors;
        });
        setRows(parsed); setErrors([...result.errors.map((error) => error.message), ...validation]);
      },
      error(error) { setRows([]); setErrors([error.message]); },
    });
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "jamora-batch-import.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  async function importRows() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/admin/api/operations/inventory-batches/import", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors(Array.isArray(json.errors) ? json.errors.map((item: { row: number; message: string }) => `Row ${item.row}: ${item.message}`) : []);
        throw new Error(json.error ?? "Batch import failed.");
      }
      setMessage(`${json.batches?.length ?? rows.length} batches imported successfully.`);
      setRows([]); setFileName(""); router.refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Batch import failed."); }
    finally { setSaving(false); }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-950">Factory batch import</h2><p className="mt-1 text-sm text-slate-500">Upload factory CSV, review rows, then receive all valid batches into stock.</p></div>
        <button type="button" onClick={downloadTemplate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Download template</button>
      </div>
      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600 hover:border-blue-400">
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => loadFile(event.target.files?.[0])} />
        {fileName || "Choose factory CSV"}
      </label>
      {rows.length > 0 ? <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Production</th><th className="px-3 py-2">Expiry</th><th className="px-3 py-2">Supplier</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.slice(0, 10).map((row, index) => <tr key={`${row.batchNumber}-${index}`}><td className="px-3 py-2">{row.sku || row.slug}</td><td className="px-3 py-2 font-semibold">{row.batchNumber}</td><td className="px-3 py-2">{row.quantity}</td><td className="px-3 py-2">{row.productionDate}</td><td className="px-3 py-2">{row.expiryDate}</td><td className="px-3 py-2">{row.supplierName || "-"}</td></tr>)}</tbody></table>{rows.length > 10 ? <p className="px-3 py-2 text-xs text-slate-400">And {rows.length - 10} more rows.</p> : null}</div> : null}
      {errors.length > 0 ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{errors.slice(0, 8).map((error, index) => <p key={`${error}-${index}`}>{error}</p>)}</div> : null}
      {rows.length > 0 ? <button type="button" onClick={importRows} disabled={saving || errors.length > 0} className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Importing..." : `Import ${rows.length} batches`}</button> : null}
      {message ? <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p> : null}
    </section>
  );
}
