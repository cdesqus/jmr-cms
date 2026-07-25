import type {
  CustomerPaymentSnapshot,
  PaymentMethod,
  PaymentStatus,
} from "./payment-customer-policy.cjs";

export function acceptedPaymentMethods(input: unknown): PaymentMethod[];
export function checkoutAttempt<T extends { signature: string; key: string }>(
  current: T | null,
  signature: string,
  createKey: () => string,
): T | { signature: string; key: string };
export function paymentStatusView(status: PaymentStatus): {
  tone: "paid" | "failed" | "attention" | "pending";
  label: string;
  paid: boolean;
};
export function shouldPollPayment(status: PaymentStatus): boolean;
export function effectivePaymentSnapshot(
  snapshot: CustomerPaymentSnapshot,
  now?: Date,
): CustomerPaymentSnapshot;
export function shouldPollPaymentSnapshot(
  snapshot: CustomerPaymentSnapshot,
  now?: Date,
): boolean;
export function mergePaymentSnapshot(
  current: CustomerPaymentSnapshot | undefined,
  next: CustomerPaymentSnapshot,
  now?: Date,
): CustomerPaymentSnapshot;
export function paymentPreparationRequest(
  method: PaymentMethod,
  input: {
    idempotencyKey: string;
    subjectType: "order" | "membership";
    subjectId: string;
    purpose: "order" | "membership_purchase" | "membership_renewal";
    currency: "RON" | "EUR";
    guestCheckoutCapability?: string;
    checkoutReference?: string;
  },
): {
  endpoint: string;
  body: {
    idempotencyKey: string;
    subjectType: "order" | "membership";
    subjectId: string;
    purpose: "order" | "membership_purchase" | "membership_renewal";
    currency: "RON" | "EUR";
    guestCheckoutCapability?: string;
    checkoutReference?: string;
  };
};
export function pendingCheckoutOrderState(
  orderId: string,
  createdAt?: string,
): {
  status: "pending";
  emailConfirmationSent: false;
  statusHistory: Array<{
    id: string;
    type: "status";
    status: "pending";
    note: string;
    actor: string;
    createdAt: string;
  }>;
};
export function snapshotInstructionRows(
  snapshot: CustomerPaymentSnapshot,
): Array<[string, string | { amountMinor: number; currency: "RON" | "EUR" }]>;
