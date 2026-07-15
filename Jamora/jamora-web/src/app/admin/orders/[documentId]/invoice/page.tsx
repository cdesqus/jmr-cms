import { notFound } from "next/navigation";
import { AdminOrderDocument } from "@/components/admin-order-document";
import { getAdminOrders, parseOrderItems } from "@/lib/admin-api";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const order = (await getAdminOrders()).find((item) => item.documentId === documentId);
  if (!order) notFound();
  return <AdminOrderDocument order={order} items={parseOrderItems(order)} kind="invoice" />;
}
