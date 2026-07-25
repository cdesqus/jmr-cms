import { NextResponse } from "next/server";
import { adminIdentityHeaders, getAdminIdentity } from "@/lib/admin-session";
import {
  assertPaymentAdminMethod,
  assertPaymentReceiptInput,
  assertPaymentResolutionInput,
  canManagePayments,
  isPaymentsEnabled,
  paymentAdminPath,
  paymentProviderError,
} from "@/lib/payment-admin-policy.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!isPaymentsEnabled(process.env)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const identity = await getAdminIdentity();
  if (!canManagePayments(identity)) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const { path } = await context.params;
  let targetPath: string;
  try {
    assertPaymentAdminMethod(request.method, path);
    targetPath = paymentAdminPath(path);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: string | undefined;
  if (request.method === "POST") {
    try {
      const input = await request.json();
      if (path.length === 2 && path[1] === "receipt") {
        body = JSON.stringify({
          ...assertPaymentReceiptInput(input),
          providerEventId: `admin-receipt:${path[0]}:${crypto.randomUUID()}`,
        });
      } else if (path.length === 2 && path[1] === "resolve") {
        body = JSON.stringify({
          ...assertPaymentResolutionInput(input),
          providerEventId: `admin-resolution:${path[0]}:${crypto.randomUUID()}`,
        });
      } else {
        body = "{}";
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid request." },
        { status: 400 },
      );
    }
  }

  try {
    const response = await fetch(`${STRAPI_URL}${targetPath}`, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        ...(ADMIN_API_SECRET ? { "x-jamora-admin-secret": ADMIN_API_SECRET } : {}),
        ...(await adminIdentityHeaders()),
      },
      body,
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: paymentProviderError() }, { status: response.status });
    }
    const json = await response.json().catch(() => null);
    return NextResponse.json(json, { status: response.status });
  } catch {
    return NextResponse.json({ error: paymentProviderError() }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
