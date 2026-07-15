import { NextResponse } from "next/server";

const STRAPI_URL = process.env.STRAPI_URL ?? process.env.NEXT_PUBLIC_STRAPI_URL ?? "http://localhost:9014";

export async function POST(request: Request) {
  const response = await fetch(`${STRAPI_URL}/api/jamora/inventory/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Inventory service unavailable." }));
  return NextResponse.json(json, { status: response.status });
}
