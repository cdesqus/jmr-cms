import "server-only";

import { adminIdentityHeaders, getAdminIdentity } from "@/lib/admin-session";
import { canManagePayments, isPaymentsEnabled } from "@/lib/payment-admin-policy.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

export type PaymentCurrency = "RON" | "EUR";
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

export interface AdminPaymentEvent {
  eventId: string;
  transition: string;
  actor: string;
  reason?: string;
  occurredAt: string;
}

export interface AdminPayment {
  documentId: string;
  paymentReference: string;
  purpose: PaymentPurpose;
  method: "bank_transfer" | "ropay" | "mock";
  expected: { amountMinor: number; currency: PaymentCurrency };
  received?: { amountMinor: number; currency: PaymentCurrency; receivedAt?: string };
  status: PaymentStatus;
  expiresAt?: string;
  customerDocumentId?: string;
  orderDocumentId?: string;
  membershipDocumentId?: string;
  events: AdminPaymentEvent[];
}

async function paymentFetch<T>(path: string): Promise<T> {
  if (!isPaymentsEnabled(process.env)) throw new Error("Payments are disabled.");
  const identity = await getAdminIdentity();
  if (!canManagePayments(identity)) throw new Error("Owner access required.");
  const response = await fetch(`${STRAPI_URL}${path}`, {
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(ADMIN_API_SECRET ? { "x-jamora-admin-secret": ADMIN_API_SECRET } : {}),
      ...(await adminIdentityHeaders()),
    },
  });
  if (!response.ok) throw new Error("Payment service unavailable.");
  return response.json() as Promise<T>;
}

export async function getAdminPayments() {
  const { payments } = await paymentFetch<{ payments: AdminPayment[] }>("/api/jamora/admin/payments");
  return payments;
}
