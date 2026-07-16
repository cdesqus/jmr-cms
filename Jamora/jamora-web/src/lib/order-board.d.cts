import type { AdminOrder, AdminOrderStatus } from "./admin-api";

export type OrderStatusTabId = "all" | AdminOrderStatus;
export interface OrderStatusTab {
  id: OrderStatusTabId;
  label: string;
  statuses: AdminOrderStatus[];
}

export const ORDER_STATUS_TABS: OrderStatusTab[];
export function filterOrdersByStatus<T extends Pick<AdminOrder, "status" | "orderNumber" | "customerName" | "email" | "trackingNumber">>(orders: T[], tabId: OrderStatusTabId, query?: string): T[];
