import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-api";
import {
  availablePaymentMethods,
  customerPaymentPath,
  isPaymentsEnabled,
  isRoPayEnabled,
  paymentPreparationBody,
  safePaymentResponse,
  trustedPaymentHeaders,
} from "@/lib/payment-customer-policy.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

async function forward(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!isPaymentsEnabled(process.env)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { path } = await context.params;
  let target: string;
  try {
    target = customerPaymentPath(
      request.method,
      path,
      isRoPayEnabled(process.env),
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (target === "local:methods") {
    return NextResponse.json({
      methods: availablePaymentMethods(
        process.env,
        new URL(request.url).searchParams.get("currency"),
      ),
    });
  }

  let body: string | undefined;
  let guestCapability: string | undefined;
  if (request.method === "POST") {
    try {
      const input = await request.json();
      guestCapability =
        typeof input?.guestCheckoutCapability === "string"
          ? input.guestCheckoutCapability.trim()
          : undefined;
      body = JSON.stringify(paymentPreparationBody(
        input,
        target === "/api/jamora/payments/ropay/intent"
          ? "ropay"
          : "bank_transfer",
      ));
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
  } else {
    guestCapability =
      request.headers.get("x-jamora-checkout-capability")?.trim() || undefined;
  }

  try {
    const customer = await getCurrentCustomer();
    const headers = trustedPaymentHeaders(
      {},
      process.env.JAMORA_STOREFRONT_API_SECRET,
      customer,
      guestCapability,
    );
    const response = await fetch(`${STRAPI_URL}${target}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            response.status === 404
              ? "Not found."
              : "Payment request could not be completed.",
        },
        { status: response.status },
      );
    }
    const json = await response.json();
    return NextResponse.json(safePaymentResponse(json), {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { error: "Payment service unavailable." },
      { status: 503 },
    );
  }
}

export const GET = forward;
export const POST = forward;
