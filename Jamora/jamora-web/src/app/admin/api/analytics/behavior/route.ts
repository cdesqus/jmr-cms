import { NextResponse } from "next/server";
import { adminIdentityHeaders } from "@/lib/admin-session";
const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
export async function GET() {
  const response = await fetch(`${STRAPI_URL}/api/jamora/admin/analytics/behavior`, { headers: { ...(process.env.JAMORA_ADMIN_API_SECRET ? { "x-jamora-admin-secret": process.env.JAMORA_ADMIN_API_SECRET } : {}), ...(await adminIdentityHeaders()) }, cache: "no-store" });
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
