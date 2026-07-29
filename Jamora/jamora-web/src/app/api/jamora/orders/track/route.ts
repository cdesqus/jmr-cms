import { NextResponse } from "next/server";
import { publicTrackingSearchParams } from "@/lib/order-tracking-policy.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const access = searchParams.get("access")?.trim();
  const upstreamQuery = publicTrackingSearchParams(query ?? "", access);

  if (!upstreamQuery) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const res = await fetch(
    `${STRAPI_URL}/api/jamora/orders/track?${upstreamQuery}`,
    { cache: "no-store" },
  );
  const body = await res.json().catch(() => ({}));

  return NextResponse.json(body, { status: res.status });
}
