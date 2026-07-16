import { AdminPurchaseOrdersManager } from "@/components/admin-purchase-orders-manager";
import { getAdminProducts, getPurchaseOrders, getSuppliers } from "@/lib/admin-api";

export default async function PurchaseOrdersPage() {
  const [purchaseOrders, suppliers, products] = await Promise.all([getPurchaseOrders().catch(() => []), getSuppliers().catch(() => []), getAdminProducts().catch(() => [])]);
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Procurement</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Purchase orders</h1><p className="mt-2 text-sm text-slate-500">Order production batches and receive them directly into traceable inventory.</p></div><AdminPurchaseOrdersManager purchaseOrders={purchaseOrders} suppliers={suppliers} products={products} /></div>;
}
