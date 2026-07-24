export function customerMembershipPath(method: string, path: string[]): string;
export function membershipCustomerBoundary(
  env: Record<string, string | undefined>,
  customer: unknown,
): { status: 401 | 404; error: string } | null;
export function membershipOperationBody(operation: string, input: unknown): Record<string, string>;
export function membershipDashboard<T extends Record<string, unknown>>(membership: T): T & {
  state: string;
  totals: { remaining: number; reserved: number; redeemed: number; expired: number };
  canRedeem: boolean;
};
