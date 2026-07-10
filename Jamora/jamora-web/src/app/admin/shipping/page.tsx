import Link from "next/link";
import { getAdminOrders } from "@/lib/admin-api";

export default async function AdminShippingPage() {
  const orders = (await getAdminOrders()).filter((order) =>
    ["paid", "processing", "shipped"].includes(order.status),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">
          Fulfilment
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">Shipping queue</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {orders.map((order) => (
          <Link
            key={order.documentId}
            href={`/admin/orders/${order.documentId}`}
            className="rounded-xl border border-clay bg-cream p-5 hover:border-terracotta"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl text-ink">{order.orderNumber}</p>
                <p className="mt-1 text-sm text-stone">{order.email}</p>
              </div>
              <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-bark">
                {order.status}
              </span>
            </div>
            <p className="mt-4 text-sm text-bark">{order.shippingAddressText}</p>
            <p className="mt-3 text-sm font-semibold text-ink">
              Tracking: {order.trackingNumber || "not assigned"}
            </p>
          </Link>
        ))}
        {orders.length === 0 && <p className="text-stone">No orders need shipping.</p>}
      </div>
    </div>
  );
}

