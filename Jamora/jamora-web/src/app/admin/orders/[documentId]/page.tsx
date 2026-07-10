import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatAdminMoney,
  getAdminOrders,
  parseOrderItems,
} from "@/lib/admin-api";
import { AdminOrderActions } from "@/components/admin-order-actions";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const orders = await getAdminOrders();
  const order = orders.find((item) => item.documentId === documentId);
  if (!order) notFound();
  const items = parseOrderItems(order.itemsSummary);

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
        </div>
      </div>

      <AdminOrderActions order={order} />

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
            <div>
              <dt className="font-semibold text-slate-700">Estimated profit</dt>
              <dd>{formatAdminMoney(order.estimatedProfitCents)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

