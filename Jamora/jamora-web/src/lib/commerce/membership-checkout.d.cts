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
export function membershipCartProjection(input: {
  selected: boolean;
  coveredMerchandiseMinor?: number;
  subtotalMinor?: number;
  shippingMinor: number;
  discountMinor?: number;
}): {
  membership: boolean;
  merchandiseLabel: string;
  merchandiseMinor: number;
  shippingMinor: number;
  discountMinor?: number;
  totalMinor: number;
};
