import { NextResponse } from "next/server";
import { prepareCheckoutPayloadText } from "@/lib/commerce/checkout.cjs";
import { getCurrentCustomer } from "@/lib/customer-api";
import { membershipCustomerFetch } from "@/lib/membership-customer-api";
import { checkoutReference } from "@/lib/commerce/membership-checkout.cjs";
import { membershipCheckoutMode } from "@/lib/membership-surface-policy.cjs";
import { phase1PaidCheckoutAllowed } from "@/lib/payment-customer-policy.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function POST(request: Request) {
  let body: string;
  try {
    body = prepareCheckoutPayloadText(
      await request.text(),
      process.env.STRUCTURED_CHECKOUT_ENABLED === "true",
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid checkout payload." },
      { status: 400 },
    );
  }
  let membershipCheckout: {
    checkoutReference?: string;
    idempotencyKey?: string;
  } | undefined;
  try {
    membershipCheckout = JSON.parse(body).membershipCheckout;
  } catch {
    membershipCheckout = undefined;
  }
  const checkoutMode = membershipCheckoutMode({ membershipCheckout }, process.env);
  if (!phase1PaidCheckoutAllowed(process.env, checkoutMode)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (checkoutMode !== "ordinary") {
    if (checkoutMode === "membership-disabled") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (!membershipCheckout) {
      return NextResponse.json({ error: "Invalid membership checkout." }, { status: 400 });
    }
    const customer = await getCurrentCustomer();
    if (!customer) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    try {
      checkoutReference(membershipCheckout.checkoutReference);
      if (!membershipCheckout.idempotencyKey?.trim()) throw new Error("Invalid membership checkout.");
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid membership checkout." },
        { status: 400 },
      );
    }
    const parsed = JSON.parse(body);
    const finalized = await membershipCustomerFetch<{ order?: unknown; error?: string }>(
      "/api/jamora/membership/checkout/finalize",
      customer,
      {
        method: "POST",
        body: JSON.stringify({
          checkoutReference: membershipCheckout.checkoutReference,
          idempotencyKey: membershipCheckout.idempotencyKey,
          orderNumber: parsed.orderNumber,
          trackingNumber: parsed.trackingNumber,
          carrier: parsed.carrier,
          customerName: parsed.customer?.name,
          shippingAddressText: parsed.customer?.address,
          shippingAddress: parsed.shippingAddress,
          estimatedDelivery: parsed.estimatedDelivery,
        }),
      },
    ).catch(() => ({ status: 503, body: { error: "Membership service unavailable." } }));
    const finalizedBody = finalized.body as { order?: unknown; error?: string };
    return NextResponse.json(
      finalized.status < 400
        ? { ok: true, order: finalizedBody.order }
        : { error: finalizedBody.error ?? "Membership checkout could not be finalized." },
      { status: finalized.status },
    );
  }
  const response = await fetch(`${STRAPI_URL}/api/jamora/orders/mock-paid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Order service unavailable." }));
  return NextResponse.json(json, { status: response.status });
}
