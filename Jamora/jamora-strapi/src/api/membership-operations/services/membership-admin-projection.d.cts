export function projectAdminMemberships(
  memberships: Array<Record<string, unknown> & { documentId: string }>,
  entries: Array<Record<string, unknown> & { membershipDocumentId: string; kind: string }>,
): Array<Record<string, unknown> & {
  documentId: string;
  ledgerBalance: number;
  creditEntries: Array<Record<string, unknown>>;
  adjustmentHistory: Array<Record<string, unknown>>;
}>;
export function listAdminMemberships(
  adapter: {
    findMemberships(query: Record<string, unknown>): Promise<Array<Record<string, unknown> & { documentId: string }>>;
    findEntries(query: Record<string, unknown>): Promise<Array<Record<string, unknown> & { membershipDocumentId: string; kind: string }>>;
  },
  options?: { pageSize?: number; maximumEntries?: number },
): Promise<ReturnType<typeof projectAdminMemberships>>;
