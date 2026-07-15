"use client";

import type { AdminOrder, AdminOrderItem } from "@/lib/admin-api";
import { formatAdminMoney } from "@/lib/admin-api";

export function AdminOrderDocument({
  order,
  items,
  kind,
}: {
  order: AdminOrder;
  items: AdminOrderItem[];
  kind: "invoice" | "packing-slip";
}) {
  const invoice = kind === "invoice";

  return (
    <div className="admin-print-document mx-auto max-w-4xl">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Print {invoice ? "invoice" : "packing slip"}
        </button>
      </div>
      <article className="border border-slate-300 bg-white p-8 text-slate-950 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-950 pb-6">
          <div>
            <p className="text-3xl font-black">Jamora</p>
            <p className="mt-1 text-sm text-slate-600">Romania fulfilment centre</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              {invoice ? "Invoice" : "Packing slip"}
            </p>
            <p className="mt-1 text-xl font-bold">
              {invoice ? order.invoiceNumber ?? order.orderNumber : order.orderNumber}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {formatDate(order.createdAt)}
            </p>
          </div>
        </header>

        <section className="grid gap-8 border-b border-slate-300 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ship to</p>
            <p className="mt-2 text-lg font-bold">{order.customerName}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{order.shippingAddressText}</p>
            <p className="mt-1 text-sm">{order.email}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Fulfilment</p>
            <p className="mt-2 font-semibold">{order.carrier}</p>
            <p className="text-sm">Tracking: {order.trackingNumber || "Not assigned"}</p>
            <p className="text-sm capitalize">Status: {order.status}</p>
          </div>
        </section>

        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b border-slate-950 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="py-3">Item</th>
              <th className="py-3">SKU</th>
              <th className="py-3 text-right">Qty</th>
              {invoice ? <th className="py-3 text-right">Amount</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, index) => (
              <tr key={`${item.productId ?? item.name}-${index}`}>
                <td className="py-3 font-semibold">{item.name}</td>
                <td className="py-3 text-slate-500">{item.sku || "-"}</td>
                <td className="py-3 text-right">{item.qty}</td>
                {invoice ? <td className="py-3 text-right">{formatAdminMoney(item.lineTotalCents)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>

        {invoice ? (
          <dl className="ml-auto mt-6 max-w-xs space-y-2 border-t border-slate-300 pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatAdminMoney(order.subtotalCents ?? order.totalCents)}</dd></div>
            <div className="flex justify-between"><dt>Shipping</dt><dd>{formatAdminMoney(order.shippingCents)}</dd></div>
            {(order.discountCents ?? 0) > 0 ? (
              <div className="flex justify-between text-emerald-700"><dt>Discount {order.promotionCode ? `(${order.promotionCode})` : ""}</dt><dd>-{formatAdminMoney(order.discountCents)}</dd></div>
            ) : null}
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatAdminMoney(order.totalCents)}</dd></div>
          </dl>
        ) : (
          <div className="mt-8 border-2 border-dashed border-slate-400 p-4 text-sm font-semibold">
            Handle with care. Keep this parcel dry, upright, and away from direct heat.
          </div>
        )}

        <footer className="mt-10 border-t border-slate-300 pt-4 text-xs text-slate-500">
          {invoice
            ? "Prices include applicable VAT. Keep this document for your records."
            : `Packed for order ${order.orderNumber}. Verify all quantities before sealing.`}
        </footer>
      </article>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}
