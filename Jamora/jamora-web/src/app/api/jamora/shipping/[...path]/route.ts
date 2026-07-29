import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-api";
import {
  customerShippingPath,
  safeShippingResponse,
  safeTrackingClaim,
  shippingOperationEnabled,
  shippingOperationBody,
  trustedShippingHeaders,
} from "@/lib/shipping-customer-policy.cjs";
import { guestShippingCapabilityBoundary } from "@/lib/shipping-capability";
import {
  BoundedJsonError,
  readBoundedJsonObject,
} from "@/lib/bounded-json-request";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const MAX_BODY_BYTES = 4_096;

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  let target: string;
  let operation: string;
  try {
    target = customerShippingPath("POST", path);
    operation = path.join("/");
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!shippingOperationEnabled(operation, process.env)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON request required." }, { status: 415 });
  }

  let body: Record<string, unknown>;
  try {
    body = shippingOperationBody(
      operation,
      await readBoundedJsonObject(request, MAX_BODY_BYTES),
    );
  } catch (error) {
    const status = error instanceof BoundedJsonError ? error.status : 400;
    return NextResponse.json(
      { error: status === 413 ? "Request is too large." : "Invalid request." },
      { status },
    );
  }

  try {
    const customer = await getCurrentCustomer();
    const guestCapability =
      request.headers.get("x-jamora-checkout-capability")?.trim() || undefined;
    if (operation === "shipping/tracking/capabilities/claim" && !customer) {
      return NextResponse.json(
        { error: "Verified customer session required." },
        { status: 401 },
      );
    }
    if (!customer) {
      const boundary = await guestShippingCapabilityBoundary(guestCapability);
      if (boundary === "invalid") {
        return NextResponse.json(
          { error: "Valid guest reservation required." },
          { status: 401 },
        );
      }
      if (boundary === "limited") {
        return NextResponse.json(
          { error: "Too many requests." },
          { status: 429 },
        );
      }
    }
    const headers = trustedShippingHeaders(
      {},
      process.env.JAMORA_STOREFRONT_API_SECRET,
      customer,
      guestCapability,
    );
    const response = await fetch(`${STRAPI_URL}${target}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        {
          error: response.status === 404
            ? "Not found."
            : "Shipping request could not be completed.",
        },
        { status: response.status },
      );
    }
    const responseBody = await response.json();
    return NextResponse.json(
      operation === "shipping/tracking/capabilities/claim"
        ? safeTrackingClaim(
            responseBody,
            process.env.JAMORA_STOREFRONT_URL ?? new URL(request.url).origin,
          )
        : safeShippingResponse(operation, responseBody),
      { status: response.status },
    );
  } catch {
    return NextResponse.json(
      { error: "Shipping service unavailable." },
      { status: 503 },
    );
  }
}
