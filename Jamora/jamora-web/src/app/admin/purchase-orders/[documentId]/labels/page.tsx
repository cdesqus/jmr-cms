import { notFound } from "next/navigation";
import { AdminFactoryLabelSheet } from "@/components/admin-purchase-order-document";
import { getPurchaseOrders } from "@/lib/admin-api";

export default async function PurchaseOrderLabelsPage({ params, searchParams }: { params: Promise<{ documentId: string }>; searchParams: Promise<{ format?: string }> }) {
  const [{ documentId }, query] = await Promise.all([params, searchParams]);
  const order = (await getPurchaseOrders()).find((candidate) => candidate.documentId === documentId);
  if (!order) notFound();
  return <AdminFactoryLabelSheet order={order} kind={query.format === "carton" ? "carton" : "unit"} />;
}
