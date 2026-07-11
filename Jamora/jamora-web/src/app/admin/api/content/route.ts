import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

export async function PATCH(request: Request) {
  const body = await request.json();
  const res = await fetch(`${STRAPI_URL}/api/jamora/admin/content`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(ADMIN_API_SECRET
        ? { "x-jamora-admin-secret": ADMIN_API_SECRET }
        : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    revalidatePath("/");
  }
  return NextResponse.json(json, { status: res.status });
}
