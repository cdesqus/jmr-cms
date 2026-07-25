export function requiredOrderReservationToken(
  value: unknown,
  options: { shippingEnabled?: boolean; pendingPayment?: boolean },
): string | undefined;
export function reservationExpiryForSelection(
  now: Date | string,
  selection?: Record<string, unknown>,
): string;
export function assertLiveReservationBinding(
  reservation: Record<string, unknown>,
  input: {
    token: string;
    items: unknown[];
    email: string;
    customerDocumentId?: string;
    orderNumber: string;
    shippingQuote: Record<string, unknown>;
    now: Date | string;
  },
): unknown[];
export function assertExistingOrderReplay(
  order: Record<string, unknown>,
  reservation: Record<string, unknown>,
  input: {
    token: string;
    email: string;
    customerDocumentId?: string;
    now: Date | string;
  },
): void;
export function exactAllocationUpdate(
  allocation: Record<string, unknown>,
  row: Record<string, unknown> | null,
): Record<string, unknown>;
