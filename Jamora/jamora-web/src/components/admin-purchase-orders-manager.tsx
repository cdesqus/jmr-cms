"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminProduct, PurchaseOrder, PurchaseOrderItem, Supplier } from "@/lib/admin-api";

const NEXT: Partial<Record<PurchaseOrder["status"], PurchaseOrder["status"]>> = { draft: "ordered", ordered: "in_transit", in_transit: "received" };
const emptyLine = (productDocumentId = "") => ({ productDocumentId, quantity: 1, unitsPerCarton: 24, batchNumber: "", productionDate: "", expiryDate: "", certificateUrl: "" });

export function AdminPurchaseOrdersManager({ purchaseOrders, suppliers, products }: { purchaseOrders: PurchaseOrder[]; suppliers: Supplier[]; products: AdminProduct[] }) {
  const router = useRouter();
  const defaultSupplierId = suppliers.find((supplier) => supplier.active)?.documentId ?? "";
  const defaultProductId = products.find((product) => product.supplierDocumentIds?.includes(defaultSupplierId))?.documentId ?? "";
  const [supplierDocumentId, setSupplierDocumentId] = useState(defaultSupplierId);
  const [poNumber, setPoNumber] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [line, setLine] = useState(emptyLine(defaultProductId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const availableProducts = products.filter((product) => product.supplierDocumentIds?.includes(supplierDocumentId));
  const selectedSupplier = suppliers.find((supplier) => supplier.documentId === supplierDocumentId);

  function selectSupplier(documentId: string) {
    if (items.length > 0 && !window.confirm("Changing supplier will clear the current PO items. Continue?")) return;
    const firstProduct = products.find((product) => product.supplierDocumentIds?.includes(documentId));
    setSupplierDocumentId(documentId);
    setItems([]);
    setLine(emptyLine(firstProduct?.documentId));
    setError("");
  }

  function addLine() {
    const product = availableProducts.find((candidate) => candidate.documentId === line.productDocumentId);
    if (!product || line.quantity <= 0 || line.unitsPerCarton <= 0 || !line.batchNumber || !line.productionDate || !line.expiryDate) {
      setError("Complete product, quantity, carton size, batch, production date, and expiry date before adding the line.");
      return;
    }
    setItems((current) => [...current, { ...line, productName: product.name, sku: product.sku, batchNumber: line.batchNumber.toUpperCase() }]);
    setLine(emptyLine(availableProducts[0]?.documentId));
    setError("");
  }

  async function create() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/admin/api/operations/purchase-orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierDocumentId, poNumber, expectedDate, items }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = Array.isArray(json.errors) ? ` ${json.errors.map((item: { row: number; message: string }) => `Line ${item.row}: ${item.message}`).join(" ")}` : "";
        throw new Error(`${json.error ?? "Could not create purchase order."}${details}`);
      }
      setItems([]);
      setPoNumber("");
      setExpectedDate("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create purchase order.");
    } finally {
      setSaving(false);
    }
  }

  async function advance(order: PurchaseOrder) {
    const status = NEXT[order.status];
    if (!status) return;
    setError("");
    const response = await fetch(`/admin/api/operations/purchase-orders/${order.documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = Array.isArray(json.errors) ? ` ${json.errors.map((item: { row: number; message: string }) => `Row ${item.row}: ${item.message}`).join(" ")}` : "";
      setError(`${json.error ?? "Could not update purchase order."}${details}`);
      return;
    }
    router.refresh();
  }

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div><h2 className="text-xl font-bold">New purchase order</h2><p className="mt-1 text-sm text-slate-500">One supplier, multiple production batches and products.</p></div>
        <button type="button" onClick={create} disabled={saving || !supplierDocumentId || items.length === 0} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Creating..." : `Create PO (${items.length})`}</button>
      </header>

      <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-3">
        <label className={labelClass}>Supplier<select value={supplierDocumentId} onChange={(event) => selectSupplier(event.target.value)} className={inputClass}>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.documentId} value={supplier.documentId}>{supplier.name}</option>)}</select></label>
        <Field label="PO number (optional)" value={poNumber} onChange={(value) => setPoNumber(value.toUpperCase())} />
        <Field label="Expected date" type="date" value={expectedDate} onChange={setExpectedDate} />
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold">Add line item</p><p className="text-xs text-slate-500">Products approved for {selectedSupplier?.name || "this supplier"}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{availableProducts.length} available</span></div>
        {availableProducts.length > 0 ? <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass}>Product<select value={line.productDocumentId} onChange={(event) => setLine({ ...line, productDocumentId: event.target.value })} className={inputClass}>{availableProducts.map((product) => <option key={product.documentId} value={product.documentId}>{product.name} ({product.sku || "no SKU"})</option>)}</select></label>
          <NumberField label="Quantity" value={line.quantity} onChange={(quantity) => setLine({ ...line, quantity })} />
          <NumberField label="Units per carton" value={line.unitsPerCarton} onChange={(unitsPerCarton) => setLine({ ...line, unitsPerCarton })} />
          <Field label="Batch number" value={line.batchNumber} onChange={(batchNumber) => setLine({ ...line, batchNumber })} />
          <Field label="Production date" type="date" value={line.productionDate} onChange={(productionDate) => setLine({ ...line, productionDate })} />
          <Field label="Expiry date" type="date" value={line.expiryDate} onChange={(expiryDate) => setLine({ ...line, expiryDate })} />
          <Field label="Certificate URL (optional)" value={line.certificateUrl} onChange={(certificateUrl) => setLine({ ...line, certificateUrl })} />
          <div className="flex items-end"><button type="button" onClick={addLine} className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Add to PO</button></div>
        </div> : <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">No products are assigned to this supplier. Open <Link href="/admin/products" className="font-bold underline">Product master data</Link> and select this supplier under Approved suppliers.</div>}

        {items.length > 0 ? <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full table-fixed text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.1em] text-slate-500"><tr><th className="w-[24%] px-4 py-3">Product</th><th className="w-[16%] px-3 py-3">Batch</th><th className="w-[14%] px-3 py-3">Production</th><th className="w-[14%] px-3 py-3">Expiry</th><th className="w-[10%] px-3 py-3 text-right">Qty</th><th className="w-[14%] px-3 py-3 text-right">Cartons</th><th className="w-[8%] px-3 py-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{items.map((item, index) => <tr key={`${item.batchNumber}-${index}`}><td className="px-4 py-3"><p className="truncate font-bold">{item.productName}</p><p className="font-mono text-xs text-slate-500">{item.sku || "No SKU"}</p></td><td className="truncate px-3 py-3 font-mono text-xs font-semibold">{item.batchNumber}</td><td className="px-3 py-3 text-slate-600">{item.productionDate}</td><td className="px-3 py-3 text-slate-600">{item.expiryDate}</td><td className="px-3 py-3 text-right font-bold">{item.quantity}</td><td className="px-3 py-3 text-right"><strong>{Math.ceil(item.quantity / (item.unitsPerCarton || 24))}</strong><span className="block text-xs text-slate-500">{item.unitsPerCarton || 24}/carton</span></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-bold text-red-600">Remove</button></td></tr>)}</tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50"><tr><td colSpan={4} className="px-4 py-3 text-sm font-bold">{items.length} line item{items.length === 1 ? "" : "s"}</td><td className="px-3 py-3 text-right font-black">{items.reduce((sum, item) => sum + item.quantity, 0)}</td><td colSpan={2} /></tr></tfoot></table>
        </div> : <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No line items yet. Add several products above before creating the PO.</div>}
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold">Purchase order history</h2><p className="mt-1 text-sm text-slate-500">Production orders grouped by supplier.</p></div>
      <div className="hidden grid-cols-[1fr_1fr_0.8fr_0.8fr_1.6fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>PO</span><span>Supplier</span><span>Status</span><span>Volume</span><span className="text-right">Documents & action</span></div>
      <div className="divide-y divide-slate-100">{purchaseOrders.map((order) => {
        const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return <article key={order.documentId} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr_1.6fr] lg:items-center">
          <div><p className="font-bold">{order.poNumber}</p><p className="text-xs text-slate-500">{order.expectedDate ? `Expected ${order.expectedDate}` : "No expected date"}</p></div>
          <div><p className="text-sm font-semibold">{order.supplierName}</p><p className="text-xs text-slate-500">{order.items.length} product line{order.items.length === 1 ? "" : "s"}</p></div>
          <div><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{order.status.replaceAll("_", " ")}</span></div>
          <div><p className="text-sm font-bold">{totalUnits} units</p><p className="text-xs text-slate-500">{order.items.map((item) => item.productName).join(", ")}</p></div>
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end"><DocumentLink href={`/admin/purchase-orders/${order.documentId}/print`} label="PO PDF" /><DocumentLink href={`/admin/purchase-orders/${order.documentId}/labels?format=unit`} label="Unit labels" /><DocumentLink href={`/admin/purchase-orders/${order.documentId}/labels?format=carton`} label="Carton labels" />{NEXT[order.status] ? <button type="button" onClick={() => advance(order)} className={`rounded-lg px-3 py-2 text-xs font-bold text-white ${NEXT[order.status] === "received" ? "bg-emerald-600" : "bg-blue-600"}`}>{NEXT[order.status] === "received" ? "Receive stock" : `Move to ${NEXT[order.status]?.replaceAll("_", " ")}`}</button> : null}</div>
        </article>;
      })}{purchaseOrders.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No purchase orders yet.</p> : null}</div>
    </section>
  </div>;
}

function DocumentLink({ href, label }: { href: string; label: string }) { return <Link href={href} target="_blank" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">{label}</Link>; }
const labelClass = "text-sm font-semibold text-slate-700";
const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className={labelClass}>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className={labelClass}>{label}<input type="number" min={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>; }
