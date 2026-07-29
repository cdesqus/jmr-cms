export function purchasePaymentReference(
  customerDocumentId: string,
  operation: "purchase" | "renew",
  idempotencyKey: string,
  renewalOf?: string,
): string;
