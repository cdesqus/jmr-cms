import { adminIdentityHeaders, getAdminIdentity } from "@/lib/admin-session";
import { readBoundedJsonObject } from "@/lib/bounded-json-request";
import {
  assertLabelCapability,
  canManageShipping,
  isShippingEnabled,
  safeShipmentMutationResponse,
  shippingAdminOperation,
  shippingProviderError,
  shippingRequestFailure,
} from "@/lib/shipping-admin-policy.cjs";

const STRAPI_URL = process.env.STRAPI_URL ?? "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;
const LABEL_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.zebra-zpl",
]);

async function forward(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!isShippingEnabled(process.env)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const identity = await getAdminIdentity();
  if (!canManageShipping(identity)) {
    return Response.json(
      { error: "Owner or warehouse access required." },
      { status: 403 },
    );
  }

  const { path } = await context.params;
  let operation;
  try {
    const input = request.method === "POST"
      ? await readBoundedJsonObject(request, 4_096)
      : undefined;
    operation = shippingAdminOperation(request.method, path, input);
  } catch (error) {
    const { status, message } = shippingRequestFailure(error);
    return Response.json(
      { error: message },
      { status },
    );
  }

  let target = `${STRAPI_URL}${operation.targetPath}`;
  if (operation.kind === "download") {
    try {
      const capability = assertLabelCapability(
        new URL(request.url).searchParams.get("capability"),
      );
      target += `?capability=${encodeURIComponent(capability)}`;
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid request." },
        { status: 400 },
      );
    }
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        ...(request.method === "POST"
          ? { "content-type": "application/json" }
          : {}),
        ...(ADMIN_API_SECRET
          ? { "x-jamora-admin-secret": ADMIN_API_SECRET }
          : {}),
        ...(await adminIdentityHeaders()),
      },
      body: request.method === "POST" ? operation.body ?? "{}" : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      return Response.json(
        { error: shippingProviderError() },
        { status: response.status },
      );
    }
    if (operation.kind === "download") {
      const contentType = response.headers.get("content-type")?.split(";")[0];
      if (!contentType || !LABEL_CONTENT_TYPES.has(contentType) || !response.body) {
        return Response.json(
          { error: shippingProviderError() },
          { status: 502 },
        );
      }
      const extension = contentType === "application/pdf" ? "pdf" : "zpl";
      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": contentType,
          "content-disposition": `attachment; filename="shipment-label.${extension}"`,
          "cache-control": "no-store, private",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const json = await response.json().catch(() => null);
    return Response.json(
      safeShipmentMutationResponse(json, operation.kind),
      { status: response.status },
    );
  } catch {
    return Response.json(
      { error: shippingProviderError() },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
