"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPoReceivingModal } from "@/components/admin-po-receiving-modal";
import type { PurchaseOrder } from "@/lib/admin-api";
import { isPurchaseOrderReceivable, purchaseOrderOutstanding } from "@/lib/receiving.cjs";

export function AdminReceivingWorkspace({ purchaseOrders }: { purchaseOrders: PurchaseOrder[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const receivable = useMemo(() => purchaseOrders.filter(isPurchaseOrderReceivable), [purchaseOrders]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return receivable;
    return receivable.filter((order) => [order.poNumber, order.supplierName, ...order.items.flatMap((item) => [item.productName, item.sku, item.batchNumber])].some((value) => value?.toLowerCase().includes(needle)));
  }, [query, receivable]);
  const outstanding = receivable.reduce((sum, order) => sum + purchaseOrderOutstanding(order), 0);
  const partial = receivable.filter((order) => order.status === "partially_received").length;

  return <>
    <section className="grid gap-3 sm:grid-cols-3">
      <Metric label="Open deliveries" value={receivable.length} />
      <Metric label="Outstanding units" value={outstanding} accent />
      <Metric label="Partial receipts" value={partial} alert={partial > 0} />
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <label className="sr-only" htmlFor="receiving-search">Search receiving</label>
        <input id="receiving-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PO, supplier, product, SKU, or batch" className="w-full max-w-2xl rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
      </div>
      <div className="hidden grid-cols-[1fr_1fr_0.8fr_0.9fr_120px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Purchase order</span><span>Supplier</span><span>Status</span><span>Outstanding</span><span className="text-right">Action</span></div>
      <div className="divide-y divide-slate-100">{filtered.map((order) => {
        const ordered = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const received = order.items.reduce((sum, item) => sum + (item.receivedQuantity ?? 0), 0);
        return <article key={order.documentId} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_1fr_0.8fr_0.9fr_120px] lg:items-center">
          <div><p className="font-bold text-slate-950">{order.poNumber}</p><p className="text-xs text-slate-500">{order.items.length} product line{order.items.length === 1 ? "" : "s"}{order.expectedDate ? ` - expected ${order.expectedDate}` : ""}</p></div>
          <div><p className="text-sm font-semibold text-slate-800">{order.supplierName}</p><p className="truncate text-xs text-slate-500">{order.items.map((item) => item.productName).join(", ")}</p></div>
          <div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${order.status === "partially_received" ? "bg-amber-50 text-amber-700" : order.status === "in_transit" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>{order.status.replaceAll("_", " ")}</span></div>
          <div><p className="text-sm font-bold text-slate-950">{ordered - received} units</p><p className="text-xs text-slate-500">{received} of {ordered} received</p></div>
          <div className="lg:text-right"><button type="button" onClick={() => setSelectedOrder(order)} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Receive</button></div>
        </article>;
      })}{filtered.length === 0 ? <div className="px-5 py-12 text-center"><p className="font-semibold text-slate-700">{receivable.length === 0 ? "No deliveries awaiting receipt" : "No matching purchase orders"}</p></div> : null}</div>
    </section>

    {selectedOrder ? <AdminPoReceivingModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onComplete={() => { setSelectedOrder(null); router.refresh(); }} /> : null}
  </>;
}

function Metric({ label, value, accent = false, alert = false }: { label: string; value: number; accent?: boolean; alert?: boolean }) { return <div className={`rounded-xl border bg-white p-5 ${accent ? "border-emerald-200" : "border-slate-200"}`}><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className={`mt-2 text-3xl font-bold ${alert ? "text-amber-700" : accent ? "text-emerald-700" : "text-slate-950"}`}>{value.toLocaleString()}</p></div>; }
