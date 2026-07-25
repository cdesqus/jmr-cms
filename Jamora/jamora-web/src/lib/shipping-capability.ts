import "server-only";

import { cookies } from "next/headers";
import {
  createGuestCapabilityProof,
  guestCapabilityRateAllowed,
  hasGuestCapabilityProof,
} from "@/lib/shipping-customer-policy.cjs";

const COOKIE_NAME = "jamora.shipping-capability-proof";
const MAX_AGE_SECONDS = 10 * 60;

function storefrontSecret() {
  const secret = process.env.JAMORA_STOREFRONT_API_SECRET;
  if (!secret) throw new Error("Shipping service unavailable.");
  return secret;
}

export async function setGuestShippingCapabilityProof(capability: string) {
  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_NAME,
    createGuestCapabilityProof(storefrontSecret(), capability),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/jamora/shipping",
      maxAge: MAX_AGE_SECONDS,
    },
  );
}

export async function guestShippingCapabilityBoundary(capability?: string) {
  const cookieStore = await cookies();
  const proof = cookieStore.get(COOKIE_NAME)?.value;
  if (!capability ||
      !hasGuestCapabilityProof(storefrontSecret(), capability, proof)) {
    return "invalid" as const;
  }
  return guestCapabilityRateAllowed(capability)
    ? "allowed" as const
    : "limited" as const;
}
