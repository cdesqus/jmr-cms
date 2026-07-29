import { parseOrderItems, type AdminOrder, type AdminProduct, type FulfilmentChecklistItem } from "@/lib/admin-api";

export function buildFulfilmentChecklist(order: AdminOrder, products: AdminProduct[]) {
  const orderItems = parseOrderItems(order);
  const saved = Array.isArray(order.fulfilmentChecklist)
    ? order.fulfilmentChecklist
    : [];
  const allocations = Array.isArray(order.batchAllocations)
    ? order.batchAllocations
    : [];
  if (allocations.length > 0) {
    return allocations.map((allocation) => {
      const item = orderItems.find((candidate) =>
        candidate.productId === allocation.productDocumentId &&
        candidate.slug === allocation.slug,
      );
      const product = products.find((candidate) =>
        candidate.documentId === allocation.productDocumentId,
      );
      const prior = saved.find((candidate) =>
        candidate.productId === allocation.productDocumentId &&
        candidate.sku === allocation.sku &&
        candidate.batchDocumentId === allocation.batchDocumentId &&
        candidate.batchNumber === allocation.batchNumber &&
        candidate.qty === allocation.qty,
      );
      const scannedQty = Number.isSafeInteger(prior?.scannedQty)
        ? Math.max(0, Math.min(allocation.qty, prior?.scannedQty ?? 0))
        : 0;
      return {
        productId: allocation.productDocumentId,
        sku: allocation.sku || item?.sku || product?.sku,
        name: allocation.name || item?.name || product?.name || "Product",
        batchDocumentId: allocation.batchDocumentId,
        batchNumber: allocation.batchNumber,
        qty: allocation.qty,
        scannedQty,
        checked: prior?.checked === true && scannedQty === allocation.qty,
      };
    });
  }
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
    item.batchNumber.toLowerCase() === code,
  );
  return checklist.findIndex((item) => {
    if ((item.scannedQty ?? 0) >= item.qty) return false;
    if (allocation) {
      return item.batchDocumentId === allocation.batchDocumentId &&
        item.batchNumber === allocation.batchNumber &&
        item.productId === allocation.productDocumentId;
    }
    return item.sku?.toLowerCase() === code;
  });
}

export function isPackingComplete(checklist: FulfilmentChecklistItem[], packedBy?: string) {
  return Boolean(packedBy?.trim()) &&
    checklist.length > 0 &&
    checklist.every((item) =>
      item.checked === true &&
      Number.isSafeInteger(item.qty) &&
      item.qty > 0 &&
      Number.isSafeInteger(item.scannedQty) &&
      item.scannedQty === item.qty,
    );
}
