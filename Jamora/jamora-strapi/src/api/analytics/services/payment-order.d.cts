export function pendingPaymentOrderFields(input: {
  customerDocumentId?: string;
  priceSnapshot: Record<string, unknown>;
}): Record<string, unknown>;
export function phase1MockPaidOrderFields(orderNumber: string): Record<string, unknown>;
