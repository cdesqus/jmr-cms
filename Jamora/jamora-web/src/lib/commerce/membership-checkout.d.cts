export type MembershipCheckoutItem = {
  qty: number;
  unitPriceMinor: number;
  creditCost: number;
  eligible?: boolean;
  ordinary?: boolean;
};

export type MembershipCheckoutTotals = {
  merchandiseMinor: 0;
  coveredMerchandiseMinor: number;
  creditsRequired: number;
  shippingMinor: number;
  totalMinor: number;
};

export function buildMembershipTotals(input: {
  items: MembershipCheckoutItem[];
  availableCredits: number;
  shippingMinor: number;
  membership: {
    status: string;
    startsAt?: string | null;
    endsAt?: string | null;
  };
  now?: Date | string;
}): MembershipCheckoutTotals;

export function checkoutReference(value: unknown): string;
export function opaqueCheckoutReference(
  secret: string,
  customerDocumentId: string,
  idempotencyKey: string,
): string;

export function createMembershipCheckout(adapter: Record<string, (...args: unknown[]) => Promise<unknown>>): {
  reserve(input: Record<string, unknown>): Promise<unknown>;
  finalize(input: Record<string, unknown>): Promise<unknown>;
};
