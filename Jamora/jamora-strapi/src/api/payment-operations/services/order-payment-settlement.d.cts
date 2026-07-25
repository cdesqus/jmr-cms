export function assertReservationAllocationBinding(
  allocations: Array<Record<string, unknown>>,
  orderItems: Array<Record<string, unknown>>,
): void;
export function settleOrdinaryOrder(
  adapter: Record<string, Function>,
  payment: Record<string, unknown>,
): Promise<{ order: Record<string, unknown>; idempotent: boolean }>;
