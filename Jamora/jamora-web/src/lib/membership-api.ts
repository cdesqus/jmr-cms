import "server-only";
import { adminIdentityHeaders, getAdminIdentity } from "@/lib/admin-session";
import {
  assertAdjustmentInput,
  assertPlanInput,
  canManageMembership,
  isMembershipEnabled,
} from "@/lib/membership-admin-policy.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

export interface MembershipPlanInput {
  name: string;
  active: boolean;
  durationMonths: 3 | 6 | 12;
  priceEurMinor: number;
  priceRonMinor: number;
  packageCredits: number;
  eligibleProductSlugs: string[];
}

export interface MembershipPlan extends MembershipPlanInput {
  documentId: string;
}

export interface MembershipCreditEntry {
  entryId?: string;
  kind: string;
  credits?: number;
  creditDelta?: number;
  actor?: string;
  reason?: string;
  occurredAt?: string;
}

export interface AdminMembership {
  documentId: string;
  membershipNumber: string;
  customerDocumentId: string;
  planSnapshot: MembershipPlanInput;
  status: "pending_payment" | "active" | "expired" | "cancelled" | "refunded";
  startsAt?: string | null;
  endsAt?: string | null;
  cachedRemainingCredits?: number;
  ledgerBalance: number;
  creditEntries?: MembershipCreditEntry[];
  adjustmentHistory?: MembershipCreditEntry[];
}

async function membershipFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isMembershipEnabled(process.env)) throw new Error("Membership is disabled.");
  const identity = await getAdminIdentity();
  if (!canManageMembership(identity)) throw new Error("Owner access required.");
  const response = await fetch(`${STRAPI_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(ADMIN_API_SECRET ? { "x-jamora-admin-secret": ADMIN_API_SECRET } : {}),
      ...(await adminIdentityHeaders()),
      ...(init?.headers ?? {}),
    },
  });
  const json = await response.json().catch(() => ({ error: "Membership service unavailable." }));
  if (!response.ok) {
    throw new Error(typeof json?.error === "string" ? json.error : `Membership API failed: ${response.status}`);
  }
  return json as T;
}

export async function getMembershipPlans() {
  const { plans } = await membershipFetch<{ plans: MembershipPlan[] }>("/api/jamora/admin/membership/plans");
  return plans;
}

export async function getMemberships() {
  const { memberships } = await membershipFetch<{ memberships: AdminMembership[] }>("/api/jamora/admin/memberships");
  return memberships;
}

export function createMembershipPlan(input: MembershipPlanInput) {
  return membershipFetch<MembershipPlan>("/api/jamora/admin/membership/plans", {
    method: "POST",
    body: JSON.stringify(assertPlanInput(input)),
  });
}

export function updateMembershipPlan(documentId: string, input: MembershipPlanInput) {
  return membershipFetch<MembershipPlan>(
    `/api/jamora/admin/membership/plans/${encodeURIComponent(documentId)}`,
    { method: "PATCH", body: JSON.stringify(assertPlanInput(input)) },
  );
}

export function adjustMembership(documentId: string, input: { creditDelta: number; reason: string }) {
  const adjustment = assertAdjustmentInput(input);
  return membershipFetch(`/api/jamora/admin/memberships/${encodeURIComponent(documentId)}/adjust`, {
    method: "POST",
    body: JSON.stringify({
      ...adjustment,
      idempotencyKey: `admin-adjustment:${documentId}:${crypto.randomUUID()}`,
    }),
  });
}

export async function expireDueMemberships() {
  const { expired } = await membershipFetch<{ expired: number }>("/api/jamora/admin/memberships/expire-due", {
    method: "POST",
    body: "{}",
  });
  return expired;
}
