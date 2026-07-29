import {
  browserSafeOperationBody,
  customerError,
  proxyCustomerBody,
} from "@/lib/customer-api";

export async function POST(request: Request) {
  const result = await proxyCustomerBody(request, "reset-password");
  if (result instanceof Response) return result;
  if (result.status < 200 || result.status >= 300) return customerError(result.status);
  const body = browserSafeOperationBody("reset-password", result.body);
  return body ? Response.json(body) : customerError(502);
}
