import "server-only";
import type { SafeCustomer } from "@/lib/customer-api";
import { trustedMembershipHeaders } from "@/lib/membership-customer-policy.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";

export type CustomerCreditEntry = {
  entryId?: string;
  kind: string;
  credits?: number;
  creditDelta?: number;
  actor?: string;
  reason?: string;
  occurredAt?: string;
};

export type CustomerMembershipPlan = {
  documentId: string;
  name: string;
  active: boolean;
  durationMonths: 3 | 6 | 12;
  priceEurMinor: number;
  priceRonMinor: number;
  packageCredits: number;
  eligibleProductSlugs: string[];
};

export type CustomerMembership = {
  documentId: string;
  membershipNumber: string;
  planDocumentId: string;
  planSnapshot: Omit<CustomerMembershipPlan, "documentId" | "active">;
  status: "pending_payment" | "active" | "expired" | "cancelled" | "refunded";
  startsAt?: string | null;
  endsAt?: string | null;
  ledgerBalance: number;
  creditEntries: CustomerCreditEntry[];
};

export async function membershipCustomerFetch<T>(
  path: string,
  customer: SafeCustomer,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const secret = process.env.JAMORA_STOREFRONT_API_SECRET;
  if (!secret) throw new Error("Membership service unavailable.");
  const response = await fetch(`${STRAPI_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: trustedMembershipHeaders(init.headers, secret, customer),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as T,
  };
}

export async function getCustomerMembershipPlans(customer: SafeCustomer) {
  const response = await membershipCustomerFetch<{ plans?: CustomerMembershipPlan[] }>(
    "/api/jamora/membership/plans", customer,
  );
  if (response.status !== 200 || !Array.isArray(response.body.plans)) {
    throw new Error("Membership service unavailable.");
  }
  return response.body.plans;
}

export async function getCustomerMemberships(customer: SafeCustomer) {
  const response = await membershipCustomerFetch<{ memberships?: CustomerMembership[] }>(
    "/api/jamora/membership/me", customer,
  );
  if (response.status !== 200 || !Array.isArray(response.body.memberships)) {
    throw new Error("Membership service unavailable.");
  }
  return response.body.memberships;
}
