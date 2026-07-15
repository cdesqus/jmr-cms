import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatAdminMoney,
  getAdminOrders,
  parseOrderItems,
} from "@/lib/admin-api";
import { AdminOrderActions } from "@/components/admin-order-actions";
import { AdminCreateReturn } from "@/components/admin-create-return";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const orders = await getAdminOrders();
  const order = orders.find((item) => item.documentId === documentId);
  if (!order) notFound();
  const items = parseOrderItems(order);
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm font-semibold text-blue-600">
        Back to orders
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Order
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-slate-500">{order.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.trackingPreviewUrl && (
            <Link
              href={order.trackingPreviewUrl}
              target="_blank"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Preview tracking
            </Link>
          )}
          {order.deliveryLabelUrl && (
            <Link
              href={order.deliveryLabelUrl}
              target="_blank"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Print label
            </Link>
          )}
          <Link
            href={`/admin/orders/${order.documentId}/invoice`}
            target="_blank"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Invoice
          </Link>
          <Link
            href={`/admin/orders/${order.documentId}/packing-slip`}
            target="_blank"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Packing slip
          </Link>
          <AdminCreateReturn order={order} items={items} />
        </div>
      </div>

      <AdminOrderActions order={order} />

      {order.batchAllocations && order.batchAllocations.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold text-slate-950">Batch allocation</h2>
          <p className="mt-1 text-sm text-slate-500">Allocated by FEFO when the checkout reservation was created.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {order.batchAllocations.map((allocation, index) => (
              <div key={`${allocation.batchNumber}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">{allocation.name}</p>
                <p className="mt-1 text-sm text-slate-600">Batch {allocation.batchNumber} · Qty {allocation.qty}</p>
                {allocation.expiryDate ? <p className="mt-1 text-xs text-slate-400">Expires {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(allocation.expiryDate))}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold text-slate-950">Items</h2>
          <div className="mt-4 divide-y divide-slate-200">
            {items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex justify-between py-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-slate-500">Qty {item.qty ?? 0}</p>
                </div>
                <p className="font-semibold">
                  {formatAdminMoney(item.lineTotalCents ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold text-slate-950">Shipping</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-slate-700">Customer</dt>
              <dd>{order.customerName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Address</dt>
              <dd className="whitespace-pre-line">{order.shippingAddressText}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Total</dt>
              <dd>{formatAdminMoney(order.totalCents)}</dd>
            </div>
            {(order.discountCents ?? 0) > 0 ? (
              <div>
                <dt className="font-semibold text-slate-700">Promotion</dt>
                <dd>{order.promotionCode} · -{formatAdminMoney(order.discountCents)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold text-slate-700">Estimated profit</dt>
              <dd>{formatAdminMoney(order.estimatedProfitCents)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold text-slate-950">Order timeline</h2>
        <div className="mt-5 space-y-0">
          {(history.length > 0
            ? history
            : [{
                id: "legacy-created",
                type: "status" as const,
                status: order.status,
                note: "Legacy order imported before timeline tracking was enabled.",
                actor: "System",
                createdAt: order.createdAt ?? new Date().toISOString(),
              }]
          ).map((event, index, events) => (
            <div key={event.id} className="grid grid-cols-[20px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-3 w-3 rounded-full bg-blue-600" />
                {index < events.length - 1 ? <span className="min-h-12 w-px flex-1 bg-slate-200" /> : null}
              </div>
              <div className="pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold capitalize text-slate-950">
                    {event.type === "status" ? event.status : "Internal note"}
                  </p>
                  <span className="text-xs text-slate-400">
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.createdAt))}
                  </span>
                </div>
                {event.note ? <p className="mt-1 text-sm text-slate-600">{event.note}</p> : null}
                <p className="mt-1 text-xs font-semibold text-slate-400">{event.actor ?? "System"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
