import { NextResponse } from "next/server";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const response = await fetch(
    `${STRAPI_URL}/api/jamora/admin/promotions/${encodeURIComponent(documentId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(ADMIN_API_SECRET ? { "x-jamora-admin-secret": ADMIN_API_SECRET } : {}),
      },
      body: await request.text(),
    },
  );
  const json = await response.json().catch(() => ({}));
  return NextResponse.json(json, { status: response.status });
}
