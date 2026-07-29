import { NextResponse } from "next/server";
import {
  BoundedJsonError,
  readBoundedJsonObject,
} from "@/lib/bounded-json-request";
import { sanitizeVisitPayload } from "@/lib/analytics-url-safety.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function POST(request: Request) {
  const secret = process.env.JAMORA_STOREFRONT_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Analytics service unavailable." },
      { status: 503 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, 4_096);
  } catch (error) {
    const status = error instanceof BoundedJsonError ? error.status : 400;
    return NextResponse.json({ error: "Invalid request." }, { status });
  }
  const payload = sanitizeVisitPayload({
    ...body,
    userAgent: request.headers.get("user-agent") ?? "",
  });
  const response = await fetch(
    `${STRAPI_URL}/api/jamora/analytics/visit`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jamora-storefront-secret": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const result = await response.json().catch(() => ({}));
  return NextResponse.json(result, { status: response.status });
}
