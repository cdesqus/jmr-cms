export type CheckoutStep = "contact" | "address" | "delivery" | "payment" | "review";
export type CheckoutMode = "guest" | "customer" | "member";
export type ShippingQuote = {
  quoteId: string;
  carrier: string;
  service: string;
  amountMinor: number;
  currency: "RON";
  estimate: { minimumDays: number; maximumDays: number };
  quotedAt: string;
  expiresAt: string;
};
export const CHECKOUT_STEPS: readonly CheckoutStep[];
export type CheckoutWizardState = {
  steps: readonly CheckoutStep[];
  step: CheckoutStep;
  mode: CheckoutMode;
  contact: Record<string, string>;
  address: Record<string, string>;
  addressWarnings: string[];
  selectedQuote?: ShippingQuote;
  paymentMethod: "bank_transfer" | "ropay";
  reservationCapability?: string;
  reservationCapabilityExpiresAt?: string;
};
export type CheckoutWizardAction =
  | { type: "next" | "back" }
  | { type: "go"; step: CheckoutStep }
  | { type: "contact" | "address"; value: Record<string, string> }
  | { type: "warnings"; value: string[] }
  | { type: "quote"; value?: ShippingQuote }
  | { type: "payment"; value: "bank_transfer" | "ropay" }
  | {
      type: "capability";
      value?: string | { token: string; expiresAt: string };
    };
export function initialCheckoutWizardState(
  mode?: CheckoutMode,
  initial?: Record<string, unknown>,
): CheckoutWizardState;
export function checkoutWizardReducer(
  state: CheckoutWizardState,
  action: CheckoutWizardAction,
): CheckoutWizardState;
export function checkoutIdentity(input: {
  customer?: { documentId?: string } | null;
  membershipSelected?: boolean;
  reservationCapability?: string;
}):
  | { kind: "guest"; reservationCapability: string }
  | { kind: "customer" | "member"; customerDocumentId: string };
export function checkoutFeatureMode(env: Record<string, string | undefined>): {
  addressAssist: boolean;
  authoritativeShipping: boolean;
  manualStructuredAddress: boolean;
  steps: readonly CheckoutStep[];
};
export function checkoutPaymentCurrency(
  mode: CheckoutMode,
  authoritativeShipping: boolean,
): "RON" | "EUR";
export function checkoutCompletionMode(input: {
  mode: CheckoutMode;
  paymentsEnabled: boolean;
  shippingEnabled: boolean;
}): "legacy_sync" | "payment_pending";
export function shouldAssessCheckoutAddress(input: {
  addressAssistEnabled: boolean;
  shippingEnabled: boolean;
}): boolean;
export function checkoutInputDigest(
  address: Partial<Record<string, string>>,
  items: { slug: string; qty: number }[],
): string;
export function canRetainCheckoutQuote(input: {
  selectedQuote?: Pick<ShippingQuote, "expiresAt">;
  selectedDigest?: string;
  nextDigest: string;
  capabilityExpiresAt?: string;
  now?: Date;
}): boolean;
export function createSingleFlight<T = unknown>(): {
  run(operation: () => Promise<T> | T): Promise<T>;
  busy(): boolean;
};
export function addressWarningMessage(warning: string): string;
export function serverShippingSelection(input: unknown): ShippingQuote;
export function authoritativeShippingCheckoutFields(
  quote: ShippingQuote,
): { shippingSelection: ShippingQuote };
export function membershipShippingReservationFields(
  input: { membershipDocumentId?: string; idempotencyKey?: string },
  quote: ShippingQuote,
): {
  membershipDocumentId: string;
  idempotencyKey: string;
  shippingSelection: ShippingQuote;
};
