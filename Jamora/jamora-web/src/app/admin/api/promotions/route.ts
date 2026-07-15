import { NextResponse } from "next/server";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

function headers() {
  return {
    "content-type": "application/json",
    ...(ADMIN_API_SECRET ? { "x-jamora-admin-secret": ADMIN_API_SECRET } : {}),
  };
}

export async function GET() {
  const response = await fetch(`${STRAPI_URL}/api/jamora/admin/promotions`, {
    headers: headers(),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  return NextResponse.json(json, { status: response.status });
}

export async function POST(request: Request) {
  const response = await fetch(`${STRAPI_URL}/api/jamora/admin/promotions`, {
    method: "POST",
    headers: headers(),
    body: await request.text(),
  });
  const json = await response.json().catch(() => ({}));
  return NextResponse.json(json, { status: response.status });
}
