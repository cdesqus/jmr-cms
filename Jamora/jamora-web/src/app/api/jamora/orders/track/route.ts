import { NextResponse } from "next/server";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ error: "Missing tracking query." }, { status: 400 });
  }

  const res = await fetch(
    `${STRAPI_URL}/api/jamora/orders/track?q=${encodeURIComponent(query)}`,
    { cache: "no-store" },
  );
  const body = await res.json().catch(() => ({}));

  return NextResponse.json(body, { status: res.status });
}
