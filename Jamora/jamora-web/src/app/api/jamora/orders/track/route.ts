import { NextResponse } from "next/server";
import { publicTrackingSearchParams } from "@/lib/order-tracking-policy.cjs";
import { trustedPublicTrackingHeaders } from "@/lib/public-tracking-boundary.cjs";

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
  let downstreamHeaders;
  try {
    downstreamHeaders = trustedPublicTrackingHeaders(request.headers, {
      env: process.env,
      secret: process.env.JAMORA_STOREFRONT_API_SECRET,
      now: new Date(),
    });
  } catch {
    return NextResponse.json(
      { error: "Request could not be completed." },
      { status: 503 },
    );
  }

  const res = await fetch(
    `${STRAPI_URL}/api/jamora/orders/track?${upstreamQuery}`,
    {
      cache: "no-store",
      headers: downstreamHeaders,
    },
  );
  const body = await res.json().catch(() => ({}));

  return NextResponse.json(body, { status: res.status });
}
