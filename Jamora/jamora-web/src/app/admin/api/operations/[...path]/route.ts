import { NextResponse } from "next/server";
import { adminIdentityHeaders } from "@/lib/admin-session";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const SECRET = process.env.JAMORA_ADMIN_API_SECRET;

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const url = new URL(request.url);
  const target = `${STRAPI_URL}/api/jamora/admin/${path.map(encodeURIComponent).join("/")}${url.search}`;
  const method = request.method;
  const response = await fetch(target, {
    method,
    headers: {
      "content-type": "application/json",
      ...(SECRET ? { "x-jamora-admin-secret": SECRET } : {}),
      ...(await adminIdentityHeaders()),
    },
    body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Operations service unavailable." }));
  return NextResponse.json(json, { status: response.status });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
