import Link from "next/link";
import { getAdminOrders } from "@/lib/admin-api";

export default async function AdminShippingPage() {
  const orders = (await getAdminOrders()).filter((order) =>
    ["paid", "processing", "shipped"].includes(order.status),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Fulfilment
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Shipping queue</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {orders.map((order) => (
          <Link
            key={order.documentId}
            href={`/admin/orders/${order.documentId}`}
            className="rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xl font-bold text-slate-950">{order.orderNumber}</p>
                <p className="mt-1 text-sm text-slate-500">{order.email}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {order.status}
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-700">{order.shippingAddressText}</p>
            <p className="mt-3 text-sm font-semibold text-slate-950">
              Tracking: {order.trackingNumber || "not assigned"}
            </p>
          </Link>
        ))}
        {orders.length === 0 && <p className="text-slate-500">No orders need shipping.</p>}
      </div>
    </div>
  );
}

