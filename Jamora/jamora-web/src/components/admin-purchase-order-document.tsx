import { AdminPrintButton } from "@/components/admin-print-button";
import { BarcodeCode39 } from "@/components/barcode-code39";
import type { PurchaseOrder, PurchaseOrderItem, Supplier } from "@/lib/admin-api";
import { createCartonPayload } from "@/lib/receiving.cjs";

/* QR images must remain ordinary images so browser print waits for the external label asset. */
/* eslint-disable @next/next/no-img-element */

export function AdminPurchaseOrderDocument({ order, supplier }: { order: PurchaseOrder; supplier?: Supplier }) {
  const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="admin-print-document mx-auto max-w-5xl">
      <PrintToolbar label="Print / save PO PDF" />
      <article className="border border-slate-300 bg-white p-8 text-slate-950 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-slate-950 pb-6">
          <Brand />
          <div className="text-right"><Eyebrow>Purchase order</Eyebrow><p className="mt-1 text-2xl font-black">{order.poNumber}</p><p className="mt-1 text-sm capitalize text-slate-600">Status: {order.status.replaceAll("_", " ")}</p></div>
        </header>
        <section className="grid gap-8 border-b border-slate-300 py-6 sm:grid-cols-2">
          <div><Eyebrow>Production partner</Eyebrow><p className="mt-2 text-xl font-bold">{order.supplierName}</p><p className="mt-1 text-sm text-slate-600">{supplier?.contactName || "Production team"}</p><p className="text-sm text-slate-600">{supplier?.email || supplier?.phone || "Contact details not recorded"}</p><p className="text-sm text-slate-600">{supplier?.country || ""}</p></div>
          <div className="sm:text-right"><Eyebrow>Schedule</Eyebrow><p className="mt-2 text-sm"><strong>Created:</strong> {formatDate(order.createdAt)}</p><p className="text-sm"><strong>Expected:</strong> {formatDate(order.expectedDate) || "To be confirmed"}</p><p className="mt-2 text-sm font-bold">{totalUnits} total units</p></div>
        </section>
        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b border-slate-950 text-xs uppercase text-slate-500"><tr><th className="py-3">Product / SKU</th><th className="py-3">Batch</th><th className="py-3">Production</th><th className="py-3">Expiry</th><th className="py-3 text-right">Units</th><th className="py-3 text-right">Per carton</th></tr></thead>
          <tbody className="divide-y divide-slate-200">{order.items.map((item, index) => <tr key={`${item.batchNumber}-${index}`}><td className="py-4"><strong>{item.productName}</strong><br /><span className="text-xs text-slate-500">{item.sku || "No SKU"}</span></td><td className="py-4 font-mono font-semibold">{item.batchNumber}</td><td className="py-4">{formatDate(item.productionDate)}</td><td className="py-4">{formatDate(item.expiryDate)}</td><td className="py-4 text-right font-bold">{item.quantity}</td><td className="py-4 text-right">{unitsPerCarton(item)}</td></tr>)}</tbody>
        </table>
        {order.notes ? <section className="mt-8 border border-slate-300 p-4"><Eyebrow>Production notes</Eyebrow><p className="mt-2 whitespace-pre-line text-sm">{order.notes}</p></section> : null}
        <section className="mt-8 border-2 border-slate-950 p-5 text-sm"><p className="font-bold">Labelling requirement</p><p className="mt-1 text-slate-600">Apply the supplied Jamora unit label to every retail unit and one carton label to every shipping carton. Batch number, production date, and expiry date must remain readable.</p></section>
        <footer className="mt-10 flex justify-between border-t border-slate-300 pt-4 text-xs text-slate-500"><span>Generated from Jamora Admin</span><span>{order.poNumber}</span></footer>
      </article>
    </div>
  );
}

export function AdminFactoryLabelSheet({ order, kind }: { order: PurchaseOrder; kind: "unit" | "carton" }) {
  return (
    <div className="admin-print-document factory-label-document mx-auto max-w-6xl">
      <PrintToolbar label={`Print / save ${kind} labels`} />
      <div className={kind === "unit" ? "factory-unit-grid grid grid-cols-2 gap-3 bg-white p-4 sm:grid-cols-3 print:grid-cols-3" : "factory-carton-grid grid gap-5 bg-white p-4 print:p-0"}>
        {kind === "unit"
          ? unitLabels(order).map((label) => <UnitLabel key={label.key} order={order} item={label.item} copy={label.copy} />)
          : cartonLabels(order).map((label) => <CartonLabel key={label.key} order={order} item={label.item} carton={label.carton} cartons={label.cartons} quantity={label.quantity} />)}
      </div>
    </div>
  );
}

function UnitLabel({ order, item, copy }: { order: PurchaseOrder; item: PurchaseOrderItem; copy: number }) {
  return <article className="factory-unit-label flex min-h-[40mm] break-inside-avoid flex-col border-2 border-black bg-white p-3 text-black">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-lg font-black">Jamora</p><p className="truncate text-xs font-bold">{item.productName}</p></div><span className="text-[9px] font-bold">{order.poNumber}</span></div>
    <div className="mt-2 grid flex-1 grid-cols-[1fr_44px] gap-2"><div className="min-w-0"><p className="text-[9px] uppercase text-slate-500">SKU</p><p className="truncate font-mono text-[10px] font-bold">{item.sku || "NO-SKU"}</p><BarcodeCode39 value={item.sku || item.batchNumber} className="mt-1 h-8 w-full" /><p className="mt-1 text-[9px]"><strong>LOT:</strong> {item.batchNumber}</p><p className="text-[9px]"><strong>PROD:</strong> {formatDate(item.productionDate)} &nbsp; <strong>EXP:</strong> {formatDate(item.expiryDate)}</p></div><img src={qrImage(item.batchNumber)} alt={`Batch QR ${item.batchNumber}`} className="h-11 w-11 border border-black" /></div>
    <p className="mt-1 text-right text-[8px] text-slate-500">Unit {copy} / {item.quantity}</p>
  </article>;
}

function CartonLabel({ order, item, carton, cartons, quantity }: { order: PurchaseOrder; item: PurchaseOrderItem; carton: number; cartons: number; quantity: number }) {
  const scanPayload = createCartonPayload({ poNumber: order.poNumber, productDocumentId: item.productDocumentId, batchNumber: item.batchNumber, carton, quantity });
  return <article className="factory-carton-label break-after-page border-4 border-black bg-white p-8 text-black last:break-after-auto">
    <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-5"><Brand /><div className="text-right"><Eyebrow>Production carton</Eyebrow><p className="text-2xl font-black">{order.poNumber}</p><p className="mt-1 font-bold">Carton {carton} / {cartons}</p></div></header>
    <div className="grid grid-cols-[1fr_150px] gap-8 py-7"><div><Eyebrow>Product</Eyebrow><p className="mt-2 text-3xl font-black">{item.productName}</p><p className="mt-1 font-mono text-lg">SKU {item.sku || "NO-SKU"}</p><dl className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><dt className="font-bold">Batch / lot</dt><dd className="mt-1 font-mono text-lg">{item.batchNumber}</dd></div><div><dt className="font-bold">Quantity</dt><dd className="mt-1 text-3xl font-black">{quantity} units</dd></div><div><dt className="font-bold">Production date</dt><dd>{formatDate(item.productionDate)}</dd></div><div><dt className="font-bold">Expiry date</dt><dd>{formatDate(item.expiryDate)}</dd></div></dl></div><div><img src={qrImage(scanPayload)} alt={`Receiving QR carton ${carton}`} className="h-[150px] w-[150px] border-2 border-black" /><p className="mt-2 text-center text-xs font-bold">SCAN TO RECEIVE</p></div></div>
    <div className="border-t-2 border-black pt-5"><BarcodeCode39 value={item.batchNumber} className="h-20 w-full" /><p className="mt-2 text-center font-mono text-lg font-bold">{item.batchNumber}</p></div>
    <p className="mt-5 border-2 border-dashed border-black p-3 text-center text-sm font-bold">KEEP DRY · KEEP UPRIGHT · HANDLE WITH CARE</p>
  </article>;
}

function PrintToolbar({ label }: { label: string }) { return <div className="mb-4 flex flex-wrap justify-end gap-2 print:hidden"><a href="/admin/purchase-orders" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Back to POs</a><AdminPrintButton label={label} /></div>; }
function Brand() { return <div><p className="text-3xl font-black">Jamora</p><p className="mt-1 text-sm text-slate-600">Botanical wellness goods</p></div>; }
function Eyebrow({ children }: { children: React.ReactNode }) { return <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{children}</p>; }
function unitsPerCarton(item: PurchaseOrderItem) { return Math.max(1, Math.floor(item.unitsPerCarton || 24)); }
function formatDate(value?: string) { if (!value) return ""; const date = new Date(`${value.slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date); }
function qrImage(value: string) { return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(value)}`; }
function unitLabels(order: PurchaseOrder) { return order.items.flatMap((item, itemIndex) => Array.from({ length: Math.max(0, item.quantity) }, (_, copy) => ({ key: `${item.batchNumber}-${itemIndex}-${copy}`, item, copy: copy + 1 }))); }
function cartonLabels(order: PurchaseOrder) { return order.items.flatMap((item, itemIndex) => { const size = unitsPerCarton(item); const cartons = Math.ceil(item.quantity / size); return Array.from({ length: cartons }, (_, index) => ({ key: `${item.batchNumber}-${itemIndex}-${index}`, item, carton: index + 1, cartons, quantity: Math.min(size, item.quantity - index * size) })); }); }
