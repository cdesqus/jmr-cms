export type PaymentCurrency = "RON" | "EUR";

export type PaymentStatus =
  | "created"
  | "processing"
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

export interface Money {
  amountMinor: number;
  currency: PaymentCurrency;
}

export interface ReceiptClassification {
  status: "paid" | "underpaid" | "overpaid" | "currency_mismatch";
  differenceMinor: number;
}

export function normaliseMoney(input: { amountMinor: number; currency: string }): Money;
export function classifyReceipt(expected: { amountMinor: number; currency: string }, received: { amountMinor: number; currency: string }): ReceiptClassification;
export function canTransition(from: PaymentStatus | string, to: PaymentStatus | string): boolean;
export function paymentReference(prefix: string, entropy: string): string;
