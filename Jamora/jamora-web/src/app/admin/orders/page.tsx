import Link from "next/link";
import {
  formatAdminMoney,
  getAdminOrders,
  parseOrderItems,
  type AdminOrderStatus,
} from "@/lib/admin-api";

const STATUS_STYLE: Record<AdminOrderStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  paid: "bg-blue-50 text-blue-700",
  processing: "bg-amber-50 text-amber-700",
  shipped: "bg-indigo-50 text-indigo-700",
  fulfilled: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  refunded: "bg-purple-50 text-purple-700",
};

export default async function AdminOrdersPage() {
  const orders = await getAdminOrders();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Commerce
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Orders</h1>
        <p className="mt-2 text-sm text-slate-500">
          Handle paid orders, tracking, and delivery labels from one queue.
        </p>
      </div>

      <div className="grid gap-4">
        {orders.map((order) => {
          const items = parseOrderItems(order.itemsSummary);
          const labelUrl =
            order.deliveryLabelUrl ??
            (order.orderNumber
              ? `/delivery-label/${encodeURIComponent(order.orderNumber)}`
              : undefined);
          return (
            <article
              key={order.documentId}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/orders/${order.documentId}`}
                      className="text-xl font-bold text-slate-950 hover:text-blue-700"
                    >
                      {order.orderNumber ?? order.documentId}
                    </Link>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold capitalize",
                        STATUS_STYLE[order.status],
                      ].join(" ")}
                    >
                      {order.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {order.customerName || "Customer"} · {order.email}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-950">
                    {formatAdminMoney(order.totalCents)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {order.createdAt
                      ? new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                        }).format(new Date(order.createdAt))
                      : "No date"}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Info label="Items" value={`${items.length} item type${items.length === 1 ? "" : "s"}`} />
                <Info label="Tracking" value={order.trackingNumber || "Not assigned"} />
                <Info label="Carrier" value={order.carrier || "Jamora EU Fulfilment"} />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="max-w-2xl truncate text-sm text-slate-500">
                  {order.shippingAddressText || "No shipping address captured"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/orders/${order.documentId}`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                  >
                    Open order
                  </Link>
                  {order.trackingPreviewUrl ? (
                    <Link
                      href={order.trackingPreviewUrl}
                      target="_blank"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                    >
                      Tracking
                    </Link>
                  ) : null}
                  {labelUrl ? (
                    <Link
                      href={labelUrl}
                      target="_blank"
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Print label
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
