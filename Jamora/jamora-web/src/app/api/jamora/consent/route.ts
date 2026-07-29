import { getCurrentCustomer } from "@/lib/customer-api";
import { buildStorefrontConsentPayload } from "@/lib/commerce/consent-route-policy.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";

export async function POST(request: Request) {
  const secret = process.env.JAMORA_STOREFRONT_API_SECRET;
  if (!secret) {
    return Response.json({ error: "Consent service unavailable." }, { status: 503 });
  }
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid consent decision." }, { status: 400 });
  }
  const customer = await getCurrentCustomer();
  let body;
  try {
    body = buildStorefrontConsentPayload(input, customer);
  } catch {
    return Response.json({ error: "Invalid consent decision." }, { status: 400 });
  }
  try {
    const response = await fetch(
      `${STRAPI_URL}/api/jamora/internal/consent-decisions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jamora-storefront-secret": secret,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    return Response.json(await response.json().catch(() => ({})), {
      status: response.status,
    });
  } catch {
    return Response.json({ error: "Consent service unavailable." }, { status: 503 });
  }
}
