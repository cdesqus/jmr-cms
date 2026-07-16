"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPackingModal } from "@/components/admin-packing-modal";
import { formatAdminMoney, parseOrderItems, type AdminOrder, type AdminOrderStatus, type AdminProduct } from "@/lib/admin-api";
import { isPackingComplete } from "@/lib/packing";

type WorkflowTab = "to-pack" | "packing" | "delivery" | "completed" | "exceptions";
const TABS: { id: WorkflowTab; label: string; statuses: AdminOrderStatus[] }[] = [
  { id: "to-pack", label: "To Pack", statuses: ["paid"] },
  { id: "packing", label: "Packing", statuses: ["processing"] },
  { id: "delivery", label: "In Delivery", statuses: ["shipped"] },
  { id: "completed", label: "Completed", statuses: ["fulfilled"] },
  { id: "exceptions", label: "Exceptions", statuses: ["pending", "failed", "refunded"] },
];
const WORKFLOW_LABEL: Record<AdminOrderStatus, string> = { pending: "Awaiting payment", paid: "To pack", processing: "Packing", shipped: "In delivery", fulfilled: "Completed", failed: "Failed", refunded: "Refunded" };
const STATUS_STYLE: Record<AdminOrderStatus, string> = { pending: "bg-slate-100 text-slate-700", paid: "bg-blue-50 text-blue-700", processing: "bg-amber-50 text-amber-700", shipped: "bg-indigo-50 text-indigo-700", fulfilled: "bg-emerald-50 text-emerald-700", failed: "bg-red-50 text-red-700", refunded: "bg-purple-50 text-purple-700" };

export function AdminOrdersBoard({ orders, products, initialQuery = "" }: { orders: AdminOrder[]; products: AdminProduct[]; initialQuery?: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState<WorkflowTab>("to-pack");
  const [query, setQuery] = useState(initialQuery);
  const [packingOrder, setPackingOrder] = useState<AdminOrder | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const activeTab = TABS.find((tab) => tab.id === visible) ?? TABS[0];
  const filtered = useMemo(() => orders.filter((order) => {
    const haystack = [order.orderNumber, order.customerName, order.email, order.trackingNumber].filter(Boolean).join(" ").toLowerCase();
    return activeTab.statuses.includes(order.status) && (!normalizedQuery || haystack.includes(normalizedQuery));
  }), [orders, activeTab.statuses, normalizedQuery]);

  async function updateStatus(order: AdminOrder, status: AdminOrderStatus) {
    setUpdating(order.documentId);
    setError("");
    try {
      const response = await fetch(`/admin/api/orders/${order.documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not update order.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update order.");
    } finally {
      setUpdating(null);
    }
  }

  async function openPacking(order: AdminOrder) {
    if (order.status === "paid") {
      setUpdating(order.documentId);
      const response = await fetch(`/admin/api/orders/${order.documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "processing" }) });
      const json = await response.json().catch(() => ({}));
      setUpdating(null);
      if (!response.ok) { setError(json.error ?? "Could not start packing."); return; }
      setPackingOrder({ ...order, status: "processing" });
      router.refresh();
      return;
    }
    setPackingOrder(order);
  }

  return <div className="space-y-4">
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="relative min-w-[260px] flex-1 md:max-w-md"><span className="sr-only">Search orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, email..." className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white" /></label><p className="text-xs font-semibold text-slate-400">Showing {filtered.length} orders</p></div>
      <div className="mt-3 flex flex-wrap gap-2">{TABS.map((tab) => { const count = orders.filter((order) => tab.statuses.includes(order.status)).length; return <button key={tab.id} type="button" onClick={() => setVisible(tab.id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${visible === tab.id ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{tab.label} <span className="opacity-70">{count}</span></button>; })}</div>
    </section>

    {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[1fr_1.15fr_0.7fr_1fr_0.5fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Order</span><span>Customer</span><span>Stage</span><span>Fulfilment</span><span className="text-right">Total</span><span className="text-right">Next action</span></div>
      <div className="divide-y divide-slate-100">{filtered.map((order) => <OrderRow key={order.documentId} order={order} updating={updating === order.documentId} onPack={() => void openPacking(order)} onStatus={(status) => void updateStatus(order, status)} />)}{filtered.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-700">No orders in {activeTab.label}</p><p className="mt-1 text-sm text-slate-500">Orders will appear here when they reach this fulfilment stage.</p></div> : null}</div>
    </section>

    {packingOrder ? <AdminPackingModal order={packingOrder} products={products} onClose={() => setPackingOrder(null)} onSaved={() => { setPackingOrder(null); router.refresh(); }} /> : null}
  </div>;
}

function OrderRow({ order, updating, onPack, onStatus }: { order: AdminOrder; updating: boolean; onPack: () => void; onStatus: (status: AdminOrderStatus) => void }) {
  const items = parseOrderItems(order);
  const readyToShip = isPackingComplete(order.fulfilmentChecklist ?? [], order.packedBy);
  return <article className="grid gap-3 px-5 py-4 text-sm hover:bg-slate-50/60 md:grid-cols-2 lg:grid-cols-[1fr_1.15fr_0.7fr_1fr_0.5fr_1fr] lg:items-center">
    <div><Link href={`/admin/orders/${order.documentId}`} className="font-bold text-slate-950 hover:text-blue-700">{order.orderNumber ?? order.documentId}</Link><p className="mt-1 text-xs text-slate-500">{order.createdAt ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(order.createdAt)) : "No date"}</p></div>
    <div><p className="font-semibold text-slate-800">{order.customerName || "Customer"}</p><p className="truncate text-xs text-slate-500">{order.email}</p></div>
    <div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[order.status]}`}>{WORKFLOW_LABEL[order.status]}</span></div>
    <div><p className="font-semibold text-slate-800">{order.carrier || "Jamora EU Fulfilment"}</p><p className="mt-1 text-xs text-slate-500">{order.trackingNumber || `${items.length} item type${items.length === 1 ? "" : "s"}`}</p>{order.status === "processing" ? <p className={`mt-1 text-xs font-bold ${readyToShip ? "text-emerald-700" : "text-amber-700"}`}>{readyToShip ? "Packing complete" : "Packing verification required"}</p> : null}</div>
    <p className="font-bold lg:text-right">{formatAdminMoney(order.totalCents)}</p>
    <div className="flex flex-wrap gap-2 lg:justify-end"><PrimaryAction order={order} updating={updating} readyToShip={readyToShip} onPack={onPack} onStatus={onStatus} /><Link href={`/admin/orders/${order.documentId}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Details</Link></div>
  </article>;
}

function PrimaryAction({ order, updating, readyToShip, onPack, onStatus }: { order: AdminOrder; updating: boolean; readyToShip: boolean; onPack: () => void; onStatus: (status: AdminOrderStatus) => void }) {
  if (order.status === "paid") return <button type="button" onClick={onPack} disabled={updating} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{updating ? "Starting..." : "Pack order"}</button>;
  if (order.status === "processing") return readyToShip
    ? <button type="button" onClick={() => onStatus("shipped")} disabled={updating} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{updating ? "Updating..." : "Mark shipped"}</button>
    : <button type="button" onClick={onPack} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Continue packing</button>;
  if (order.status === "shipped") return <div className="flex gap-2">{order.trackingPreviewUrl ? <Link href={order.trackingPreviewUrl} target="_blank" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Track shipment</Link> : null}<button type="button" onClick={() => { if (window.confirm("Confirm that this order was delivered?")) onStatus("fulfilled"); }} disabled={updating} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">Delivered</button></div>;
  return <Link href={`/admin/orders/${order.documentId}`} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">{order.status === "fulfilled" ? "View order" : "Review"}</Link>;
}
