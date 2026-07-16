import { NextResponse } from "next/server";
import { adminIdentityHeaders } from "@/lib/admin-session";
const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const SECRET = process.env.JAMORA_ADMIN_API_SECRET;
const headers = async () => ({ "content-type": "application/json", ...(SECRET ? { "x-jamora-admin-secret": SECRET } : {}), ...(await adminIdentityHeaders()) });

export async function GET() {
  const response = await fetch(`${STRAPI_URL}/api/jamora/admin/inventory-batches`, { headers: await headers(), cache: "no-store" });
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
export async function POST(request: Request) {
  const response = await fetch(`${STRAPI_URL}/api/jamora/admin/inventory-batches`, { method: "POST", headers: await headers(), body: await request.text() });
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
