import { notFound } from "next/navigation";
import { AdminPurchaseOrderDocument } from "@/components/admin-purchase-order-document";
import { getPurchaseOrders, getSuppliers } from "@/lib/admin-api";

export default async function PurchaseOrderPrintPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const [orders, suppliers] = await Promise.all([getPurchaseOrders(), getSuppliers()]);
  const order = orders.find((candidate) => candidate.documentId === documentId);
  if (!order) notFound();
  return <AdminPurchaseOrderDocument order={order} supplier={suppliers.find((candidate) => candidate.documentId === order.supplierDocumentId)} />;
}
