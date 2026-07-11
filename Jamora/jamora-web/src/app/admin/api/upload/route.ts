import { NextResponse } from "next/server";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

export async function POST(request: Request) {
  const formData = await request.formData();
  const res = await fetch(`${STRAPI_URL}/api/jamora/admin/upload`, {
    method: "POST",
    headers: {
      ...(ADMIN_API_SECRET
        ? { "x-jamora-admin-secret": ADMIN_API_SECRET }
        : {}),
    },
    body: formData,
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
