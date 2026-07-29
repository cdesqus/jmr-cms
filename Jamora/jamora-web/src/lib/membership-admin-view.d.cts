export interface MembershipAdminRow {
  ledgerBalance: string;
  adjustmentHistory: Array<{
    entryId?: string;
    creditDelta?: number;
    actor?: string;
    reason?: string;
    occurredAt?: string;
  }>;
}
export function membershipAdminRow(membership: unknown): MembershipAdminRow;
export function settleMembershipMutation<T>(
  work: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }>;
