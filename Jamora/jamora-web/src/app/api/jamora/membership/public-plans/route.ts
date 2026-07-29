import { NextResponse } from "next/server";
const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
export async function GET() {
  const response = await fetch(`${STRAPI_URL}/api/jamora/membership/public-plans`, { headers: { "x-jamora-storefront-secret": process.env.JAMORA_STOREFRONT_API_SECRET ?? "" }, cache: "no-store" });
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
