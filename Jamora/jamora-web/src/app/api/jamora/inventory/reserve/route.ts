import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-api";
import {
  getCustomerMemberships,
  membershipCustomerFetch,
} from "@/lib/membership-customer-api";
import { PRODUCTS } from "@/lib/products";
import {
  buildMembershipTotals,
  opaqueCheckoutReference,
} from "@/lib/commerce/membership-checkout.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? process.env.NEXT_PUBLIC_STRAPI_URL ?? "http://localhost:9014";

type ReserveBody = {
  email?: string;
  items?: { slug?: string; qty?: number }[];
  membershipCheckout?: {
    membershipDocumentId?: string;
    shippingMinor?: number;
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
  const membership = (await getCustomerMemberships(customer).catch(() => []))
    .find((item) => item.documentId === membershipCheckout.membershipDocumentId);
  if (!membership) return NextResponse.json({ error: "Membership not found." }, { status: 400 });
  const catalog = new Map(PRODUCTS.map((product) => [product.slug, product]));
  let totals;
  try {
    totals = buildMembershipTotals({
      items: (body.items ?? []).map((item) => {
        const product = catalog.get(item.slug ?? "");
        return {
          qty: item.qty ?? Number.NaN,
          unitPriceMinor: product?.priceCents ?? Number.NaN,
          creditCost: 1,
          eligible: !!product && membership.planSnapshot.eligibleProductSlugs.includes(product.slug),
        };
      }),
      availableCredits: membership.ledgerBalance,
      shippingMinor: membershipCheckout.shippingMinor ?? Number.NaN,
      membership,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid membership checkout." },
      { status: 400 },
    );
  }
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
  const response = await fetch(`${STRAPI_URL}/api/jamora/inventory/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, checkoutReference, idempotencyKey }),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Inventory service unavailable." }));
  if (!response.ok || !json.reservationToken) {
    return NextResponse.json(json, { status: response.status });
  }
  const credit = await membershipCustomerFetch<unknown>(
    "/api/jamora/membership/reserve",
    customer,
    {
      method: "POST",
      body: JSON.stringify({
        membershipDocumentId: membership.documentId,
        checkoutReference,
        credits: totals.creditsRequired,
        idempotencyKey: `${idempotencyKey}:credit-reserve`,
      }),
    },
  ).catch(() => ({ status: 503, body: {} }));
  if (credit.status >= 400) {
    await membershipCustomerFetch(
      "/api/jamora/membership/stock-release",
      customer,
      {
        method: "POST",
        body: JSON.stringify({
          membershipDocumentId: membership.documentId,
          checkoutReference,
          reservationToken: json.reservationToken,
          idempotencyKey: `${idempotencyKey}:stock-release`,
        }),
      },
    ).catch(() => undefined);
    return NextResponse.json({ error: "Membership credits could not be reserved." }, { status: 409 });
  }
  return NextResponse.json({
    ...json,
    checkoutReference,
    membershipReservation: credit.body,
    membershipTotals: totals,
  });
}
