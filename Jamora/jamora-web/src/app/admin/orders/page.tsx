import Link from "next/link";
import { formatAdminMoney, getAdminOrders } from "@/lib/admin-api";

export default async function AdminOrdersPage() {
  const orders = await getAdminOrders();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Commerce
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Orders</h1>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">No Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {orders.map((order) => (
              <tr key={order.documentId} className="bg-white/60">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/orders/${order.documentId}`}
                    className="font-semibold text-blue-600 hover:text-blue-800"
                  >
                    {order.orderNumber ?? order.documentId}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-950">{order.customerName}</p>
                  <p className="text-slate-500">{order.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">
                  {formatAdminMoney(order.totalCents)}
                </td>
                <td className="px-4 py-3">{order.trackingNumber || "-"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {order.createdAt
                    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                        new Date(order.createdAt),
                      )
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

