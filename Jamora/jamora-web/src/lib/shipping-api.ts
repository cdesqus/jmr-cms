"use client";

import type { StructuredAddress } from "@/lib/commerce/address.cjs";
import type { ShippingQuote } from "@/lib/checkout-wizard-policy.cjs";

export type AddressSuggestion = Pick<
  StructuredAddress,
  "countryCode" | "subdivisionCode" | "locality" | "postalCode" | "street" | "building"
>;

export type AddressAssessment = {
  address: StructuredAddress;
  errors: string[];
  warnings: string[];
};

type ShippingItem = { slug: string; qty: number };
type ShippingSubject = "order" | "membership_checkout";

async function shippingRequest<T>(
  operation: string,
  body: Record<string, unknown>,
  reservationCapability?: string,
): Promise<T> {
  const response = await fetch(`/api/jamora/shipping/${operation}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(reservationCapability
        ? { "x-jamora-checkout-capability": reservationCapability }
        : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error ?? "Shipping service is unavailable.");
  }
  return result as T;
}

export async function suggestRomanianAddresses(
  query: string,
  reservationCapability?: string,
) {
  const result = await shippingRequest<{ suggestions: AddressSuggestion[] }>(
    "address/suggest",
    { query },
    reservationCapability,
  );
  return result.suggestions;
}

export async function assessRomanianAddress(
  address: StructuredAddress,
  reservationCapability?: string,
) {
  return shippingRequest<AddressAssessment>(
    "address/assess",
    { address },
    reservationCapability,
  );
}

export async function quoteShipping(input: {
  subjectType: ShippingSubject;
  address: StructuredAddress;
  items: ShippingItem[];
  reservationCapability?: string;
}) {
  const result = await shippingRequest<{ quotes: ShippingQuote[] }>(
    "shipping/quotes",
    {
      subjectType: input.subjectType,
      address: input.address,
      items: input.items,
    },
    input.reservationCapability,
  );
  return result.quotes;
}

export async function selectShippingQuote(input: {
  subjectType: ShippingSubject;
  subjectId: string;
  address: StructuredAddress;
  selection: ShippingQuote;
  reservationCapability?: string;
}) {
  return shippingRequest<{
    idempotent: boolean;
    shipping: ShippingQuote;
  }>(
    "shipping/select",
    {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      address: input.address,
      selection: input.selection,
    },
    input.reservationCapability,
  );
}
