import type { StructuredAddress } from "./commerce/address.cjs";
import type { ShippingQuote } from "./checkout-wizard-policy.cjs";

export function createGuestCapabilityProof(
  secret: string | undefined,
  capability: string,
): string;
export function hasGuestCapabilityProof(
  secret: string | undefined,
  capability: string,
  proof: string | undefined,
): boolean;
export function guestCapabilityRateAllowed(
  capability: string,
  now?: number,
): boolean;
export function customerShippingPath(method: string, path: string[]): string;
export function shippingOperationEnabled(
  operation: string,
  env: Record<string, string | undefined>,
): boolean;
export function trustedShippingHeaders(
  inputHeaders: HeadersInit,
  secret: string | undefined,
  customer: { documentId: string; sessionVersion: number } | null,
  guestCapability?: string,
): Headers;
export function shippingOperationBody(
  operation: string,
  input: unknown,
): Record<string, unknown>;
export function safeAddressSuggestions(input: unknown): {
  suggestions: Pick<
    StructuredAddress,
    "countryCode" | "subdivisionCode" | "locality" | "postalCode" | "street" | "building"
  >[];
};
export function safeAddressAssessment(input: unknown): {
  address: StructuredAddress;
  errors: string[];
  warnings: string[];
};
export function safeShippingQuotes(input: unknown): { quotes: ShippingQuote[] };
export function safeShippingSelection(input: unknown): {
  idempotent: boolean;
  shipping: ShippingQuote;
};
export function safeTrackingLinks(
  input: unknown,
  storefrontUrl: string,
): {
  links: Array<{
    orderNumber: string;
    trackingUrl: string;
  }>;
};
export function safeShippingResponse(operation: string, input: unknown): unknown;
