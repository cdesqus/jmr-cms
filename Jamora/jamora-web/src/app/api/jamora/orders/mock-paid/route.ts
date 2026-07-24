import { NextResponse } from "next/server";
import { prepareCheckoutPayloadText } from "@/lib/commerce/checkout.cjs";
import { getCurrentCustomer } from "@/lib/customer-api";
import { membershipCustomerFetch } from "@/lib/membership-customer-api";
import { checkoutReference } from "@/lib/commerce/membership-checkout.cjs";

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
    membershipDocumentId?: string;
    coveredMerchandiseMinor?: number;
    creditsRequired?: number;
    idempotencyKey?: string;
  } | undefined;
  try {
    membershipCheckout = JSON.parse(body).membershipCheckout;
  } catch {
    membershipCheckout = undefined;
  }
  let customer = null;
  if (membershipCheckout) {
    if (process.env.MEMBERSHIP_ENABLED !== "true") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    customer = await getCurrentCustomer();
    if (!customer) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    try {
      checkoutReference(membershipCheckout.checkoutReference);
      if (
        typeof membershipCheckout.coveredMerchandiseMinor !== "number" ||
        !Number.isSafeInteger(membershipCheckout.coveredMerchandiseMinor) ||
        membershipCheckout.coveredMerchandiseMinor < 0 ||
        typeof membershipCheckout.creditsRequired !== "number" ||
        !Number.isSafeInteger(membershipCheckout.creditsRequired) ||
        membershipCheckout.creditsRequired <= 0
      ) throw new Error("Invalid membership checkout.");
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid membership checkout." },
        { status: 400 },
      );
    }
  }
  const response = await fetch(`${STRAPI_URL}/api/jamora/orders/mock-paid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Order service unavailable." }));
  if (!membershipCheckout || !customer) {
    return NextResponse.json(json, { status: response.status });
  }
  const settlementBody = {
    membershipDocumentId: membershipCheckout.membershipDocumentId,
    checkoutReference: membershipCheckout.checkoutReference,
    reservationToken: JSON.parse(body).reservationToken,
  };
  if (!response.ok || !json.order?.documentId) {
    await Promise.allSettled([
      membershipCustomerFetch("/api/jamora/membership/release", customer, {
        method: "POST",
        body: JSON.stringify({
          ...settlementBody,
          idempotencyKey: `${membershipCheckout.idempotencyKey}:credit-release`,
        }),
      }),
      membershipCustomerFetch("/api/jamora/membership/stock-release", customer, {
        method: "POST",
        body: JSON.stringify({
          ...settlementBody,
          idempotencyKey: `${membershipCheckout.idempotencyKey}:stock-release`,
        }),
      }),
    ]);
    return NextResponse.json(json, { status: response.status });
  }
  const redemption = await membershipCustomerFetch("/api/jamora/membership/redeem", customer, {
    method: "POST",
    body: JSON.stringify({
      ...settlementBody,
      orderDocumentId: json.order.documentId,
      credits: membershipCheckout.creditsRequired,
      coveredMerchandiseMinor: membershipCheckout.coveredMerchandiseMinor,
      shippingMinor: JSON.parse(body).shippingCents,
      idempotencyKey: `${membershipCheckout.idempotencyKey}:credit-redeem`,
    }),
  }).catch(() => ({ status: 503, body: {} }));
  if (redemption.status >= 400) {
    await Promise.allSettled([
      membershipCustomerFetch("/api/jamora/membership/release", customer, {
        method: "POST",
        body: JSON.stringify({
          ...settlementBody,
          idempotencyKey: `${membershipCheckout.idempotencyKey}:credit-release`,
        }),
      }),
      membershipCustomerFetch("/api/jamora/membership/stock-release", customer, {
        method: "POST",
        body: JSON.stringify({
          ...settlementBody,
          consumed: true,
          idempotencyKey: `${membershipCheckout.idempotencyKey}:stock-reverse`,
        }),
      }),
    ]);
    return NextResponse.json({ error: "Membership checkout could not be finalized." }, { status: 503 });
  }
  json.order = {
    ...json.order,
    subtotalCents: 0,
    shippingCents: JSON.parse(body).shippingCents,
    discountCents: 0,
    totalCents: JSON.parse(body).shippingCents,
    membershipDocumentId: membershipCheckout.membershipDocumentId,
    membershipSnapshot: {
      checkoutReference: membershipCheckout.checkoutReference,
      creditsRedeemed: membershipCheckout.creditsRequired,
      coveredMerchandiseMinor: membershipCheckout.coveredMerchandiseMinor,
      merchandiseMinor: 0,
      shippingMinor: JSON.parse(body).shippingCents,
    },
  };
  return NextResponse.json(json, { status: response.status });
}
