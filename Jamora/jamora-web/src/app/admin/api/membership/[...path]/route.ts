import { NextResponse } from "next/server";
import { getAdminIdentity, adminIdentityHeaders } from "@/lib/admin-session";
import {
  assertAdjustmentInput,
  assertPlanInput,
  canManageMembership,
  isMembershipEnabled,
  membershipAdminPath,
} from "@/lib/membership-admin-policy.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const SECRET = process.env.JAMORA_ADMIN_API_SECRET;

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!isMembershipEnabled(process.env)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const identity = await getAdminIdentity();
  if (!canManageMembership(identity)) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const { path } = await context.params;
  let targetPath: string;
  try {
    targetPath = membershipAdminPath(path);
    assertMethod(request.method, path);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let requestBody: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      const input = await request.json();
      requestBody = JSON.stringify(path[0] === "plans"
        ? assertPlanInput(input)
        : path.at(-1) === "adjust"
          ? {
              ...assertAdjustmentInput(input),
              idempotencyKey: `admin-adjustment:${path[1]}:${crypto.randomUUID()}`,
            }
          : {});
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid request." },
        { status: 400 },
      );
    }
  }

  const response = await fetch(`${STRAPI_URL}${targetPath}`, {
    method: request.method,
    headers: {
      "content-type": "application/json",
      ...(SECRET ? { "x-jamora-admin-secret": SECRET } : {}),
      ...(await adminIdentityHeaders()),
    },
    body: requestBody,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({ error: "Membership service unavailable." }));
  return NextResponse.json(json, { status: response.status });
}

function assertMethod(method: string, path: string[]) {
  const allowed =
    (method === "GET" && ((path.length === 1 && path[0] === "plans") || (path.length === 1 && path[0] === "memberships"))) ||
    (method === "POST" && path.length === 1 && path[0] === "plans") ||
    (method === "PATCH" && path.length === 2 && path[0] === "plans") ||
    (method === "POST" && path.length === 2 && path[0] === "memberships" && path[1] === "expire-due") ||
    (method === "POST" && path.length === 3 && path[0] === "memberships" && path[2] === "adjust");
  if (!allowed) throw new Error("Method not allowed.");
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
