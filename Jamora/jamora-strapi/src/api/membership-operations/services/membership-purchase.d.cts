export function prepareMembershipPurchase(adapter: Record<string, Function>, input: {
  customerDocumentId: string;
  planDocumentId: string;
  operation: "purchase" | "renew";
  idempotencyKey: string;
  renewalOf?: string;
}): Promise<any>;
