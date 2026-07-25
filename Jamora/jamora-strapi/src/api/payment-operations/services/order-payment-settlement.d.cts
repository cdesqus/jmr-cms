export function assertReservationAllocationBinding(
  allocations: Array<Record<string, unknown>>,
  orderItems: Array<Record<string, unknown>>,
): void;
export function nextPromotionUsage(
  promotion: Record<string, unknown>,
): number;
export function settleOrdinaryOrder(
  adapter: Record<string, Function>,
  payment: Record<string, unknown>,
): Promise<{ order: Record<string, unknown>; idempotent: boolean }>;
