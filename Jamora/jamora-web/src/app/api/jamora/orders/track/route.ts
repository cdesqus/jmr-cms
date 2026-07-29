import { NextResponse } from "next/server";
import { publicTrackingSearchParams } from "@/lib/order-tracking-policy.cjs";
import {
  createPublicTrackingBrowserLimiter,
  trustedPublicTrackingHeaders,
} from "@/lib/public-tracking-boundary.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const browserTrackingLimiter = createPublicTrackingBrowserLimiter({
  limit: process.env.PUBLIC_TRACKING_BFF_RATE_LIMIT,
  windowMs: process.env.PUBLIC_TRACKING_BFF_RATE_WINDOW_MS,
  maxBuckets: process.env.PUBLIC_TRACKING_BFF_RATE_MAX_BUCKETS,
});

export async function GET(request: Request) {
  const rate = browserTrackingLimiter.check(request.headers, process.env);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Request could not be completed." },
      {
        status: 429,
        headers: rate.retryAfter
          ? { "Retry-After": String(rate.retryAfter) }
          : undefined,
      },
    );
  }
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
