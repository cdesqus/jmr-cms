export function listCustomerMemberships(
  adapter: { findMemberships(query: unknown): Promise<any[]>; findEntries(query: unknown): Promise<any[]> },
  customerDocumentId: string,
  options?: { pageSize?: number; maximumEntries?: number },
): Promise<any[]>;
