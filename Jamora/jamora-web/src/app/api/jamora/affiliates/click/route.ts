import { NextResponse } from "next/server";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";

export async function POST(request: Request) {
  if (process.env.AFFILIATES_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const response = await fetch(`${STRAPI_URL}/api/jamora/affiliates/click`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
  });
  const json = await response.json().catch(() => ({}));
  return NextResponse.json(json, { status: response.status });
}
