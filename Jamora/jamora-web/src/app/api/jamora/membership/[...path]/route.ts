import { getCurrentCustomer } from "@/lib/customer-api";
import { membershipCustomerFetch } from "@/lib/membership-customer-api";
import {
  customerMembershipPath,
  membershipCustomerBoundary,
  membershipOperationBody,
} from "@/lib/membership-customer-policy.cjs";

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const disabled = membershipCustomerBoundary(process.env, {});
  if (disabled) return Response.json({ error: disabled.error }, { status: disabled.status });
  const customer = await getCurrentCustomer();
  const boundary = membershipCustomerBoundary(process.env, customer);
  if (boundary) return Response.json({ error: boundary.error }, { status: boundary.status });
  if (!customer) return Response.json({ error: "Authentication required." }, { status: 401 });

  const { path } = await context.params;
  let target: string;
  let body: string | undefined;
  try {
    target = customerMembershipPath(request.method, path);
  } catch {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (request.method === "POST") {
    try {
      body = JSON.stringify(membershipOperationBody(path[0], await request.json()));
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
  }

  try {
    const response = await membershipCustomerFetch<unknown>(target, customer, {
      method: request.method,
      body,
    });
    if (response.status >= 500) {
      return Response.json({ error: "Membership service unavailable." }, { status: 503 });
    }
    if (response.status >= 400) {
      const status = response.status === 404 ? 404 : 400;
      return Response.json(
        { error: status === 404 ? "Not found." : "Membership request could not be completed." },
        { status },
      );
    }
    return Response.json(response.body, { status: response.status });
  } catch {
    return Response.json({ error: "Membership service unavailable." }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
