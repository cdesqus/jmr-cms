import { NextResponse } from "next/server";
import { prepareCheckoutPayloadText } from "@/lib/commerce/checkout.cjs";
import { getCurrentCustomer } from "@/lib/customer-api";
import {
  isPaymentsEnabled,
  safePendingOrderResponse,
  trustedPaymentHeaders,
} from "@/lib/payment-customer-policy.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function POST(request: Request) {
  if (!isPaymentsEnabled(process.env)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  let body: string;
  let reservationToken: string;
  try {
    body = prepareCheckoutPayloadText(
      await request.text(),
      process.env.STRUCTURED_CHECKOUT_ENABLED === "true",
    );
    const parsed = JSON.parse(body);
    if (parsed.membershipCheckout) throw new Error("Invalid order checkout.");
    reservationToken =
      typeof parsed.reservationToken === "string"
        ? parsed.reservationToken.trim()
        : "";
    if (!reservationToken) throw new Error("Reservation token is required.");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid checkout payload." },
      { status: 400 },
    );
  }

  try {
    const customer = await getCurrentCustomer();
    const headers = trustedPaymentHeaders(
      {},
      process.env.JAMORA_STOREFRONT_API_SECRET,
      customer,
      reservationToken,
    );
    const response = await fetch(
      `${STRAPI_URL}/api/jamora/orders/pending-payment`,
      {
        method: "POST",
        headers,
        body,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: "Order could not be prepared." },
        { status: response.status },
      );
    }
    return NextResponse.json(safePendingOrderResponse(await response.json()));
  } catch {
    return NextResponse.json(
      { error: "Order service unavailable." },
      { status: 503 },
    );
  }
}
