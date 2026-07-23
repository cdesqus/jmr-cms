import {
  browserSafeOperationBody,
  customerError,
  proxyCustomerBody,
} from "@/lib/customer-api";

export async function POST(request: Request) {
  const result = await proxyCustomerBody(request, "verify-email");
  if (result instanceof Response) return result;
  if (result.status < 200 || result.status >= 300) return customerError(result.status);
  const body = browserSafeOperationBody("verify-email", result.body);
  return body ? Response.json(body) : customerError(502);
}
