import { NextResponse } from "next/server";
import { adminIdentityHeaders } from "@/lib/admin-session";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

export async function POST(request: Request) {
  const body = await request.json();
  const res = await fetch(`${STRAPI_URL}/api/jamora/admin/products`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ADMIN_API_SECRET
        ? { "x-jamora-admin-secret": ADMIN_API_SECRET }
        : {}),
      ...(await adminIdentityHeaders()),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
