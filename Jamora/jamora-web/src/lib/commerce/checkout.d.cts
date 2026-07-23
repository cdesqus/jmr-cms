import type { StructuredAddress } from "./address.cjs";
import type { FxSnapshot } from "./money.cjs";

export const DEFAULT_DEMO_EUR_RON_RATE: string;
export function createDemoPriceSnapshot(
  eurMinor: number,
  options?: { rate?: string; capturedAt?: string },
): FxSnapshot;
export function formatRomanianAddress(address: StructuredAddress): string;
export function normalizeCheckoutPayload<T extends Record<string, unknown>>(
  body: T,
  options?: { rate?: string; capturedAt?: string },
): T & {
  anonymousSessionId?: string;
  shippingAddress?: StructuredAddress;
  customer: Record<string, unknown> & { address?: string };
  priceSnapshot: FxSnapshot;
};
