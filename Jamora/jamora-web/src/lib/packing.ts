import { parseOrderItems, type AdminOrder, type AdminProduct, type FulfilmentChecklistItem } from "@/lib/admin-api";

export function buildFulfilmentChecklist(order: AdminOrder, products: AdminProduct[]) {
  const orderItems = parseOrderItems(order);
  const source: FulfilmentChecklistItem[] = Array.isArray(order.fulfilmentChecklist) && order.fulfilmentChecklist.length > 0
    ? order.fulfilmentChecklist
    : orderItems.map((item) => ({ productId: item.productId, sku: item.sku, name: item.name, qty: item.qty, checked: false }));

  return source.map((item) => {
    const normalizedName = item.name.trim().toLowerCase();
    const orderItem = orderItems.find((candidate) =>
      (item.productId && candidate.productId === item.productId) || candidate.name.trim().toLowerCase() === normalizedName,
    );
    const product = products.find((candidate) =>
      (item.productId && candidate.documentId === item.productId) ||
      (orderItem?.productId && candidate.documentId === orderItem.productId) ||
      (orderItem?.slug && candidate.slug === orderItem.slug) ||
      candidate.name.trim().toLowerCase() === normalizedName,
    );
    return {
      ...item,
      productId: item.productId || orderItem?.productId || product?.documentId,
      sku: item.sku || orderItem?.sku || product?.sku,
      scannedQty: item.scannedQty ?? (item.checked ? item.qty : 0),
    };
  });
}

export function findPackingScanIndex(order: AdminOrder, checklist: FulfilmentChecklistItem[], rawCode: string) {
  const code = rawCode.trim().toLowerCase();
  if (!code) return -1;
  const allocation = (order.batchAllocations ?? []).find((item) =>
    item.batchNumber.toLowerCase() === code || item.sku?.toLowerCase() === code,
  );
  return checklist.findIndex((item) =>
    item.sku?.toLowerCase() === code ||
    Boolean(allocation && ((allocation.sku && item.sku === allocation.sku) || item.name === allocation.name)),
  );
}

export function isPackingComplete(checklist: FulfilmentChecklistItem[], packedBy?: string) {
  return Boolean(packedBy?.trim()) && checklist.length > 0 && checklist.every((item) => item.checked);
}
