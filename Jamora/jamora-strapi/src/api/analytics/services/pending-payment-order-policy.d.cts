export function pendingPaymentOrderBoundary(
  env: NodeJS.ProcessEnv,
  providedSecret: string,
): { status: number; error: string } | null;
export function pendingCustomerSessionInput(
  documentId: unknown,
  sessionVersion: unknown,
): { documentId: string; sessionVersion: number } | null;
export function phase1MockOrderAllowed(
  env: NodeJS.ProcessEnv,
  pendingPayment: boolean,
): boolean;
export function pendingPaymentReservationToken(value: unknown): string;
