import {
  browserSafeCustomer,
  customerError,
  proxyCustomerBody,
} from "@/lib/customer-api";
import {
  createCustomerSession,
  setCustomerSessionCookie,
} from "@/lib/customer-session";

export async function POST(request: Request) {
  const result = await proxyCustomerBody(request, "login");
  if (result instanceof Response) return result;
  if (result.status < 200 || result.status >= 300) return customerError(result.status);
  const customer = browserSafeCustomer(result.body);
  if (!customer || !customer.active || !customer.emailVerifiedAt) {
    return customerError(502);
  }
  await setCustomerSessionCookie(
    createCustomerSession({
      sub: customer.documentId,
      email: customer.email,
      sessionVersion: customer.sessionVersion,
    }),
  );
  return Response.json(customer);
}
