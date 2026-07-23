import {
  browserSafeOperationBody,
  customerError,
  proxyCustomerBody,
} from "@/lib/customer-api";

export async function POST(request: Request) {
  const result = await proxyCustomerBody(request, "register");
  if (result instanceof Response) return result;
  if (result.status < 200 || result.status >= 300) return customerError(result.status);
  const body = browserSafeOperationBody("register", result.body);
  return body
    ? Response.json(body, { status: result.status })
    : customerError(502);
}
