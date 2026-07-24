export interface MembershipPlanInput {
  name: string;
  durationMonths: 3 | 6 | 12 | "3" | "6" | "12";
  packageCredits: number;
  priceEurMinor: number;
  priceRonMinor: number;
  eligibleProductSlugs: string[];
  active?: boolean;
}

export interface MembershipPlan extends Omit<MembershipPlanInput, "durationMonths" | "active"> {
  durationMonths: 3 | 6 | 12;
  active: boolean;
}

export type LedgerEntry =
  | { kind: "grant" | "reserve" | "release" | "redeem" | "reverse" | "expire"; credits: number }
  | { kind: "admin_adjustment"; creditDelta: number; reason: string };

export function normalisePlan(input: MembershipPlanInput): MembershipPlan;
export function ledgerBalance(entries: LedgerEntry[]): number;
export function requiredCredits(items: Array<{ qty: number; creditCost: number }>): number;
export function assertMembershipCanReserve(
  membership: { status: string; startsAt: string | Date; endsAt: string | Date },
  balance: number,
  credits: number,
  now?: Date,
): void;
