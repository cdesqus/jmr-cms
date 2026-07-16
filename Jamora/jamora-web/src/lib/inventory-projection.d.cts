import type { AdminOrder, AdminProduct, PurchaseOrder } from "./admin-api";

export interface InventoryProjectionRow {
  productDocumentId: string;
  available: number;
  allocated: number;
  onHand: number;
  incoming: number;
  projected: number;
}

export interface InventoryProjectionTotals {
  available: number;
  allocated: number;
  onHand: number;
  incoming: number;
  projected: number;
}

export function buildInventoryProjection(
  products: AdminProduct[],
  orders: AdminOrder[],
  purchaseOrders: PurchaseOrder[],
): {
  rows: InventoryProjectionRow[];
  totals: InventoryProjectionTotals;
};

export function getInventoryHealth(input: {
  available: number;
  incoming: number;
  projected: number;
  minStock: number;
  maxStock: number;
}): "Out" | "Low" | "Restocking" | "Over max" | "Healthy";
