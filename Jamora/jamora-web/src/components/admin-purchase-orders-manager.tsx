"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminProduct, PurchaseOrder, PurchaseOrderItem, Supplier } from "@/lib/admin-api";

const NEXT: Partial<Record<PurchaseOrder["status"], PurchaseOrder["status"]>> = {
  draft: "ordered",
  ordered: "in_transit",
  in_transit: "received",
};

export function AdminPurchaseOrdersManager({ purchaseOrders, suppliers, products }: { purchaseOrders: PurchaseOrder[]; suppliers: Supplier[]; products: AdminProduct[] }) {
  const router = useRouter();
  const [supplierDocumentId, setSupplierDocumentId] = useState(suppliers.find((supplier) => supplier.active)?.documentId ?? "");
  const [poNumber, setPoNumber] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [line, setLine] = useState({
    productDocumentId: products[0]?.documentId ?? "",
    quantity: 0,
    unitsPerCarton: 24,
    batchNumber: "",
    productionDate: "",
    expiryDate: "",
    certificateUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addLine() {
    const product = products.find((candidate) => candidate.documentId === line.productDocumentId);
    if (!product || line.quantity <= 0 || line.unitsPerCarton <= 0 || !line.batchNumber || !line.productionDate || !line.expiryDate) return;
    setItems((current) => [...current, { ...line, productName: product.name, sku: product.sku, batchNumber: line.batchNumber.toUpperCase() }]);
    setLine((current) => ({ ...current, quantity: 0, batchNumber: "", productionDate: "", expiryDate: "", certificateUrl: "" }));
  }

  async function create() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/admin/api/operations/purchase-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierDocumentId, poNumber, expectedDate, items }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create purchase order.");
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
    const response = await fetch(`/admin/api/operations/purchase-orders/${order.documentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = Array.isArray(json.errors) ? ` ${json.errors.map((item: { row: number; message: string }) => `Row ${item.row}: ${item.message}`).join(" ")}` : "";
      setError(`${json.error ?? "Could not update purchase order."}${details}`);
      return;
    }
    router.refresh();
  }

  return <div className="space-y-6">
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-bold">Create purchase order</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>Supplier<select value={supplierDocumentId} onChange={(event) => setSupplierDocumentId(event.target.value)} className={inputClass}>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.documentId} value={supplier.documentId}>{supplier.name}</option>)}</select></label>
        <Field label="PO number (optional)" value={poNumber} onChange={(value) => setPoNumber(value.toUpperCase())} />
        <Field label="Expected date" type="date" value={expectedDate} onChange={setExpectedDate} />
      </div>
      <div className="mt-5 rounded-lg bg-slate-50 p-4">
        <p className="text-sm font-bold">Add production batch</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass}>Product<select value={line.productDocumentId} onChange={(event) => setLine({ ...line, productDocumentId: event.target.value })} className={inputClass}>{products.map((product) => <option key={product.documentId} value={product.documentId}>{product.name}</option>)}</select></label>
          <NumberField label="Quantity" value={line.quantity} onChange={(quantity) => setLine({ ...line, quantity })} />
          <NumberField label="Units per carton" value={line.unitsPerCarton} onChange={(unitsPerCarton) => setLine({ ...line, unitsPerCarton })} />
          <Field label="Batch number" value={line.batchNumber} onChange={(batchNumber) => setLine({ ...line, batchNumber })} />
          <Field label="Production" type="date" value={line.productionDate} onChange={(productionDate) => setLine({ ...line, productionDate })} />
          <Field label="Expiry" type="date" value={line.expiryDate} onChange={(expiryDate) => setLine({ ...line, expiryDate })} />
          <Field label="Certificate URL" value={line.certificateUrl} onChange={(certificateUrl) => setLine({ ...line, certificateUrl })} />
          <div className="flex items-end"><button type="button" onClick={addLine} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700">Add line</button></div>
        </div>
      </div>
      {items.length > 0 ? <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{items.map((item, index) => <div key={`${item.batchNumber}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span><strong>{item.productName}</strong> · {item.batchNumber} · {item.quantity} units · {item.unitsPerCarton} per carton</span><button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-bold text-red-600">Remove</button></div>)}</div> : null}
      <button type="button" onClick={create} disabled={saving || !supplierDocumentId || items.length === 0} className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Creating..." : "Create purchase order"}</button>
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
    </section>

    <section className="space-y-3">
      {purchaseOrders.map((order) => <article key={order.documentId} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><h3 className="text-lg font-bold">{order.poNumber}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{order.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-sm text-slate-500">{order.supplierName} · {order.items.length} batch line{order.items.length === 1 ? "" : "s"}{order.expectedDate ? ` · expected ${order.expectedDate}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">
            <DocumentLink href={`/admin/purchase-orders/${order.documentId}/print`} label="PO PDF" />
            <DocumentLink href={`/admin/purchase-orders/${order.documentId}/labels?format=unit`} label="Unit labels" emphasized />
            <DocumentLink href={`/admin/purchase-orders/${order.documentId}/labels?format=carton`} label="Carton labels" emphasized />
            {NEXT[order.status] ? <button type="button" onClick={() => advance(order)} className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${NEXT[order.status] === "received" ? "bg-emerald-600" : "bg-blue-600"}`}>{NEXT[order.status] === "received" ? "Receive stock" : `Move to ${NEXT[order.status]?.replaceAll("_", " ")}`}</button> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{order.items.map((item) => <span key={item.batchNumber} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{item.productName} · {item.batchNumber} · {item.quantity}</span>)}</div>
      </article>)}
      {purchaseOrders.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">No purchase orders yet.</div> : null}
    </section>
  </div>;
}

function DocumentLink({ href, label, emphasized = false }: { href: string; label: string; emphasized?: boolean }) {
  return <Link href={href} target="_blank" className={`rounded-lg border px-3 py-2 text-xs font-bold ${emphasized ? "border-blue-200 text-blue-700" : "border-slate-200 text-slate-700"}`}>{label}</Link>;
}

const labelClass = "text-sm font-semibold text-slate-700";
const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500";
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className={labelClass}>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className={labelClass}>{label}<input type="number" min={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>; }
