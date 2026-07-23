import { NextResponse } from "next/server";
import { prepareCheckoutPayloadText } from "@/lib/commerce/checkout.cjs";

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
  const response = await fetch(`${STRAPI_URL}/api/jamora/orders/mock-paid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Order service unavailable." }));
  return NextResponse.json(json, { status: response.status });
}
