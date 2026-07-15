import { NextResponse } from "next/server";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function POST(request: Request) {
  const body = await request.text();
  const response = await fetch(`${STRAPI_URL}/api/jamora/promotions/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Promotion service unavailable." }));
  return NextResponse.json(json, { status: response.status });
}
