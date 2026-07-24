import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-api";
import { membershipCustomerFetch } from "@/lib/membership-customer-api";
import { opaqueCheckoutReference } from "@/lib/commerce/membership-checkout.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? process.env.NEXT_PUBLIC_STRAPI_URL ?? "http://localhost:9014";

type ReserveBody = {
  email?: string;
  items?: { slug?: string; qty?: number }[];
  membershipCheckout?: {
    membershipDocumentId?: string;
    idempotencyKey?: string;
  };
};

export async function POST(request: Request) {
  const text = await request.text();
  let body: ReserveBody;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.membershipCheckout) {
    const response = await fetch(`${STRAPI_URL}/api/jamora/inventory/reserve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({ error: "Inventory service unavailable." }));
    return NextResponse.json(json, { status: response.status });
  }
  if (process.env.MEMBERSHIP_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const membershipCheckout = body.membershipCheckout;
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const idempotencyKey = String(membershipCheckout.idempotencyKey ?? "").trim();
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Idempotency key is required." }, { status: 400 });
  }
  const secret = process.env.JAMORA_STOREFRONT_API_SECRET;
  if (!secret) return NextResponse.json({ error: "Checkout service unavailable." }, { status: 503 });
  const checkoutReference = opaqueCheckoutReference(
    secret,
    customer.documentId,
    idempotencyKey,
  );
  const response = await membershipCustomerFetch<{
    checkoutReference?: string;
    totals?: {
      creditsRequired: number;
      coveredMerchandiseMinor: number;
      shippingMinor: number;
      totalMinor: number;
    };
    error?: string;
  }>("/api/jamora/membership/checkout/reserve", customer, {
    method: "POST",
    body: JSON.stringify({
      membershipDocumentId: membershipCheckout.membershipDocumentId,
      checkoutReference,
      idempotencyKey,
      items: body.items?.map((item) => ({ slug: item.slug, qty: item.qty })),
    }),
  });
  if (response.status >= 400 || !response.body.checkoutReference || !response.body.totals) {
    return NextResponse.json(
      { error: response.body.error ?? "Membership checkout could not be reserved." },
      { status: response.status },
    );
  }
  return NextResponse.json({
    ok: true,
    checkoutReference: response.body.checkoutReference,
    reservationToken: response.body.checkoutReference,
    membershipTotals: response.body.totals,
  });
}
