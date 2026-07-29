export interface MembershipPlanInput {
  name: string;
  active: boolean;
  durationMonths: 3 | 6 | 12;
  priceEurMinor: number;
  priceRonMinor: number;
  packageCredits: number;
  eligibleProductSlugs: string[];
}

export function isMembershipEnabled(env?: Record<string, string | undefined>): boolean;
export function canManageMembership(identity: { role?: string } | null | undefined): boolean;
export function membershipAdminPath(segments: string[]): string;
export function assertPlanInput(input: unknown): MembershipPlanInput;
export function assertAdjustmentInput(input: unknown): { creditDelta: number; reason: string };
