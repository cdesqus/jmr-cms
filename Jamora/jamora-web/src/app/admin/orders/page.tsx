import { getAdminOrders, getAdminProducts } from "@/lib/admin-api";
import { AdminOrdersBoard } from "@/components/admin-orders-board";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search = "" } = await searchParams;
  const [orders, products] = await Promise.all([getAdminOrders().catch(() => []), getAdminProducts().catch(() => [])]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Commerce
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Orders</h1>
        <p className="mt-2 text-sm text-slate-500">
          Pack, ship, and complete customer orders through a guided warehouse workflow.
        </p>
      </div>

      <AdminOrdersBoard orders={orders} products={products} initialQuery={search} />
    </div>
  );
}
