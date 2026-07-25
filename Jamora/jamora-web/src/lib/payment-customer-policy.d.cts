export type PaymentMethod = "bank_transfer" | "ropay";
export type PaymentPurpose = "order" | "membership_purchase" | "membership_renewal";
export type PaymentStatus =
  | "awaiting_payment"
  | "pending_provider"
  | "paid"
  | "underpaid"
  | "overpaid"
  | "currency_mismatch"
  | "expired"
  | "cancelled"
  | "failed"
  | "refunded";

export interface CustomerPaymentSnapshot {
  method: PaymentMethod;
  status: PaymentStatus;
  paymentReference: string;
  amountMinor: number;
  currency: "RON" | "EUR";
  expiresAt: string;
  beneficiary?: { name: string; iban: string; bank?: string };
  qrUrl?: string;
  deepLink?: string;
}

export function availablePaymentMethods(env: NodeJS.ProcessEnv): PaymentMethod[];
export function customerPaymentPath(
  method: string,
  path: string[],
  ropayEnabled: boolean,
): string;
export function isPaymentsEnabled(env: NodeJS.ProcessEnv): boolean;
export function isRoPayEnabled(env: NodeJS.ProcessEnv): boolean;
export function paymentPreparationBody(input: unknown): {
  idempotencyKey: string;
  subjectType: "order" | "membership";
  subjectId: string;
  purpose: PaymentPurpose;
  currency: "RON" | "EUR";
  checkoutReference?: string;
};
export function phase1PaidCheckoutAllowed(
  env: NodeJS.ProcessEnv,
  checkoutMode: string,
): boolean;
export function safePaymentResponse(input: unknown): CustomerPaymentSnapshot;
export function safePendingOrderResponse(input: unknown): {
  order: {
    documentId: string;
    orderNumber: string;
    status: "pending";
  };
};
export function trustedPaymentHeaders(
  inputHeaders: HeadersInit,
  secret: string | undefined,
  customer: { documentId: string; sessionVersion: number } | null,
  guestCapability?: string,
): Headers;
