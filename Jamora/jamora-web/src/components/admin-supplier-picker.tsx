import Link from "next/link";
import type { Supplier } from "@/lib/admin-api";

export function AdminSupplierPicker({ suppliers, selected, onChange }: { suppliers: Supplier[]; selected: string[]; onChange: (value: string[]) => void }) {
  const activeSuppliers = suppliers.filter((supplier) => supplier.active || selected.includes(supplier.documentId));
  return <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
    <legend className="px-1 text-sm font-bold text-slate-800">Approved suppliers</legend>
    <p className="mb-3 text-xs text-slate-500">Products are only available on purchase orders for the suppliers selected here.</p>
    {activeSuppliers.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{activeSuppliers.map((supplier) => {
      const checked = selected.includes(supplier.documentId);
      return <label key={supplier.documentId} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${checked ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}>
        <input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((id) => id !== supplier.documentId) : [...selected, supplier.documentId])} className="h-4 w-4 accent-blue-600" />
        <span className="min-w-0"><strong className="block truncate">{supplier.name}</strong><span className="font-mono text-[10px] text-slate-500">{supplier.code}</span></span>
      </label>;
    })}</div> : <p className="text-sm text-slate-500">No active suppliers. <Link href="/admin/suppliers" className="font-bold text-blue-600">Add supplier</Link></p>}
  </fieldset>;
}
