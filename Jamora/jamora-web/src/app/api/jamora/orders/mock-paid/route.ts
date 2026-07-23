import { NextResponse } from "next/server";
import { normalizeCheckoutPayload } from "@/lib/commerce/checkout.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    body = normalizeCheckoutPayload(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid checkout payload." },
      { status: 400 },
    );
  }
  const response = await fetch(`${STRAPI_URL}/api/jamora/orders/mock-paid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Order service unavailable." }));
  return NextResponse.json(json, { status: response.status });
}
