"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminProduct, PurchaseOrder, PurchaseOrderItem, Supplier } from "@/lib/admin-api";

const NEXT: Partial<Record<PurchaseOrder["status"], PurchaseOrder["status"]>> = { draft: "ordered", ordered: "in_transit", in_transit: "received" };
const emptyLine = (productDocumentId = "") => ({ productDocumentId, quantity: 1, unitsPerCarton: 24, batchNumber: "", productionDate: "", expiryDate: "", certificateUrl: "" });

export function AdminPurchaseOrdersManager({ purchaseOrders, suppliers, products }: { purchaseOrders: PurchaseOrder[]; suppliers: Supplier[]; products: AdminProduct[] }) {
  const router = useRouter();
  const defaultSupplierId = suppliers.find((supplier) => supplier.active)?.documentId ?? "";
  const initialProduct = (supplierId: string) => products.find((product) => product.supplierDocumentIds?.includes(supplierId))?.documentId ?? "";
  const [draftOpen, setDraftOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [supplierDocumentId, setSupplierDocumentId] = useState(defaultSupplierId);
  const [poNumber, setPoNumber] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [line, setLine] = useState(emptyLine(initialProduct(defaultSupplierId)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const availableProducts = products.filter((product) => product.supplierDocumentIds?.includes(supplierDocumentId));
  const selectedSupplier = suppliers.find((supplier) => supplier.documentId === supplierDocumentId);

  useEffect(() => {
    if (!draftOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (itemOpen) setItemOpen(false);
      else if (items.length === 0 && !saving) setDraftOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [draftOpen, itemOpen, items.length, saving]);

  function openDraft() {
    setSupplierDocumentId(defaultSupplierId);
    setPoNumber("");
    setExpectedDate("");
    setItems([]);
    setLine(emptyLine(initialProduct(defaultSupplierId)));
    setError("");
    setDraftOpen(true);
  }

  function closeDraft() {
    if (saving) return;
    if (items.length > 0 && !window.confirm("Discard this purchase order draft?")) return;
    setDraftOpen(false);
    setItemOpen(false);
  }

  function selectSupplier(documentId: string) {
    if (items.length > 0 && !window.confirm("Changing supplier will clear all line items. Continue?")) return;
    setSupplierDocumentId(documentId);
    setItems([]);
    setLine(emptyLine(initialProduct(documentId)));
    setError("");
  }

  function openItemDialog() {
    setLine(emptyLine(availableProducts[0]?.documentId));
    setError("");
    setItemOpen(true);
  }

  function addLine() {
    const product = availableProducts.find((candidate) => candidate.documentId === line.productDocumentId);
    if (!product || line.quantity <= 0 || line.unitsPerCarton <= 0 || !line.batchNumber || !line.productionDate || !line.expiryDate) {
      setError("Complete all required item fields before adding it to the PO.");
      return;
    }
    setItems((current) => [...current, { ...line, productName: product.name, sku: product.sku, batchNumber: line.batchNumber.toUpperCase() }]);
    setItemOpen(false);
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
      setDraftOpen(false);
      setItems([]);
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
    const response = await fetch(`/admin/api/operations/purchase-orders/${order.documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = Array.isArray(json.errors) ? ` ${json.errors.map((item: { row: number; message: string }) => `Row ${item.row}: ${item.message}`).join(" ")}` : "";
      setError(`${json.error ?? "Could not update purchase order."}${details}`);
      return;
    }
    router.refresh();
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{purchaseOrders.length} purchase order{purchaseOrders.length === 1 ? "" : "s"}</p>
      <button type="button" onClick={openDraft} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><span className="text-lg leading-none" aria-hidden="true">+</span>New purchase order</button>
    </div>

    <PurchaseOrderTable orders={purchaseOrders} advance={advance} />
    {!draftOpen && error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

    {draftOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDraft(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="po-dialog-title" className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between border-b border-slate-200 px-6 py-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Transaction</p><h2 id="po-dialog-title" className="mt-1 text-2xl font-bold">New purchase order</h2><p className="mt-1 text-sm text-slate-500">Create one order containing multiple products from the same supplier.</p></div>
          <button type="button" onClick={closeDraft} title="Close" aria-label="Close purchase order" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500 hover:bg-slate-50">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 sm:grid-cols-3">
            <label className={labelClass}>Supplier<select value={supplierDocumentId} onChange={(event) => selectSupplier(event.target.value)} className={inputClass}>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.documentId} value={supplier.documentId}>{supplier.name}</option>)}</select></label>
            <Field label="PO number (optional)" value={poNumber} onChange={(value) => setPoNumber(value.toUpperCase())} />
            <Field label="Expected date" type="date" value={expectedDate} onChange={setExpectedDate} />
          </div>

          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Line items</h3><p className="mt-1 text-xs text-slate-500">{availableProducts.length} approved product{availableProducts.length === 1 ? "" : "s"} from {selectedSupplier?.name || "supplier"}</p></div><button type="button" onClick={openItemDialog} disabled={availableProducts.length === 0} className="rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-40">+ Add item</button></div>
            {availableProducts.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">No products are assigned to this supplier. Open <Link href="/admin/products" className="font-bold underline">Product master data</Link> and assign an approved supplier.</div> : null}
            <DraftItemsTable items={items} remove={(index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
            {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 py-4"><p className="text-sm text-slate-500">{items.length} item line{items.length === 1 ? "" : "s"} · {items.reduce((sum, item) => sum + item.quantity, 0)} units</p><div className="flex gap-2"><button type="button" onClick={closeDraft} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button type="button" onClick={create} disabled={saving || !supplierDocumentId || items.length === 0} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Creating..." : "Create purchase order"}</button></div></footer>
      </section>
    </div> : null}

    {draftOpen && itemOpen ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setItemOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="item-dialog-title" className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">PO line item</p><h3 id="item-dialog-title" className="mt-1 text-xl font-bold">Add production item</h3></div><button type="button" onClick={() => setItemOpen(false)} title="Close" aria-label="Close item form" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500">×</button></header>
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>Product<select value={line.productDocumentId} onChange={(event) => setLine({ ...line, productDocumentId: event.target.value })} className={inputClass}>{availableProducts.map((product) => <option key={product.documentId} value={product.documentId}>{product.name} ({product.sku || "no SKU"})</option>)}</select></label>
          <NumberField label="Quantity" value={line.quantity} onChange={(quantity) => setLine({ ...line, quantity })} />
          <NumberField label="Units per carton" value={line.unitsPerCarton} onChange={(unitsPerCarton) => setLine({ ...line, unitsPerCarton })} />
          <Field label="Batch number" value={line.batchNumber} onChange={(batchNumber) => setLine({ ...line, batchNumber })} />
          <Field label="Production date" type="date" value={line.productionDate} onChange={(productionDate) => setLine({ ...line, productionDate })} />
          <Field label="Expiry date" type="date" value={line.expiryDate} onChange={(expiryDate) => setLine({ ...line, expiryDate })} />
          <div className="sm:col-span-2 lg:col-span-3"><Field label="Certificate URL (optional)" value={line.certificateUrl} onChange={(certificateUrl) => setLine({ ...line, certificateUrl })} /></div>
          {error ? <p className="text-sm font-semibold text-red-600 sm:col-span-2 lg:col-span-3">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><button type="button" onClick={() => setItemOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button type="button" onClick={addLine} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">Add item</button></footer>
      </section>
    </div> : null}
  </div>;
}

function DraftItemsTable({ items, remove }: { items: PurchaseOrderItem[]; remove: (index: number) => void }) {
  if (items.length === 0) return <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center"><p className="font-semibold text-slate-700">No items added</p><p className="mt-1 text-sm text-slate-500">Use Add item to build this purchase order.</p></div>;
  return <div className="mt-4 overflow-hidden rounded-lg border border-slate-200"><table className="w-full table-fixed text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.1em] text-slate-500"><tr><th className="w-[27%] px-4 py-3">Product</th><th className="w-[18%] px-3 py-3">Batch</th><th className="w-[16%] px-3 py-3">Production</th><th className="w-[16%] px-3 py-3">Expiry</th><th className="w-[10%] px-3 py-3 text-right">Qty</th><th className="w-[13%] px-3 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item, index) => <tr key={`${item.batchNumber}-${index}`}><td className="px-4 py-3"><p className="truncate font-bold">{item.productName}</p><p className="font-mono text-xs text-slate-500">{item.sku || "No SKU"}</p></td><td className="truncate px-3 py-3 font-mono text-xs font-semibold">{item.batchNumber}</td><td className="px-3 py-3 text-slate-600">{item.productionDate}</td><td className="px-3 py-3 text-slate-600">{item.expiryDate}</td><td className="px-3 py-3 text-right"><strong>{item.quantity}</strong><span className="block text-xs text-slate-500">{Math.ceil(item.quantity / (item.unitsPerCarton || 24))} cartons</span></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => remove(index)} className="text-xs font-bold text-red-600">Remove</button></td></tr>)}</tbody></table></div>;
}

function PurchaseOrderTable({ orders, advance }: { orders: PurchaseOrder[]; advance: (order: PurchaseOrder) => void }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="hidden grid-cols-[1fr_1fr_0.8fr_0.8fr_1.6fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>PO</span><span>Supplier</span><span>Status</span><span>Volume</span><span className="text-right">Documents & action</span></div><div className="divide-y divide-slate-100">{orders.map((order) => { const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0); return <article key={order.documentId} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr_1.6fr] lg:items-center"><div><p className="font-bold">{order.poNumber}</p><p className="text-xs text-slate-500">{order.expectedDate ? `Expected ${order.expectedDate}` : "No expected date"}</p></div><div><p className="text-sm font-semibold">{order.supplierName}</p><p className="text-xs text-slate-500">{order.items.length} product line{order.items.length === 1 ? "" : "s"}</p></div><div><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{order.status.replaceAll("_", " ")}</span></div><div><p className="text-sm font-bold">{totalUnits} units</p><p className="truncate text-xs text-slate-500">{order.items.map((item) => item.productName).join(", ")}</p></div><div className="flex flex-wrap justify-start gap-2 lg:justify-end"><DocumentLink href={`/admin/purchase-orders/${order.documentId}/print`} label="PO PDF" /><DocumentLink href={`/admin/purchase-orders/${order.documentId}/labels?format=unit`} label="Unit labels" /><DocumentLink href={`/admin/purchase-orders/${order.documentId}/labels?format=carton`} label="Carton labels" />{NEXT[order.status] ? <button type="button" onClick={() => advance(order)} className={`rounded-lg px-3 py-2 text-xs font-bold text-white ${NEXT[order.status] === "received" ? "bg-emerald-600" : "bg-blue-600"}`}>{NEXT[order.status] === "received" ? "Receive stock" : `Move to ${NEXT[order.status]?.replaceAll("_", " ")}`}</button> : null}</div></article>; })}{orders.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-700">No purchase orders yet</p><p className="mt-1 text-sm text-slate-500">Create the first production order for an approved supplier.</p></div> : null}</div></section>;
}

function DocumentLink({ href, label }: { href: string; label: string }) { return <Link href={href} target="_blank" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">{label}</Link>; }
const labelClass = "text-sm font-semibold text-slate-700";
const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className={labelClass}>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className={labelClass}>{label}<input type="number" min={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>; }
