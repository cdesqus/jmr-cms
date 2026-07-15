import { NextResponse } from "next/server";
const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const SECRET = process.env.JAMORA_ADMIN_API_SECRET;
export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const response = await fetch(`${STRAPI_URL}/api/jamora/admin/returns/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(SECRET ? { "x-jamora-admin-secret": SECRET } : {}) },
    body: await request.text(),
  });
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
