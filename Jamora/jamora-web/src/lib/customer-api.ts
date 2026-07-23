import "server-only";
import { cookies } from "next/headers";
import {
  CUSTOMER_SESSION_COOKIE,
  readCustomerSession,
} from "@/lib/customer-session";
import {
  browserSafeOperationBody as filterOperationBody,
  safeCustomer as filterCustomer,
} from "./customer-api-safety.cjs";
import { customerAccountsAvailable } from "./customer-account-policy.cjs";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const SESSION_PATH = "/api/jamora/customer/session";

export type SafeCustomer = {
  documentId: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  active: boolean;
  sessionVersion: number;
};

export const customerAccountsEnabled = () =>
  customerAccountsAvailable();

export async function customerRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (path === SESSION_PATH) {
    const secret = process.env.JAMORA_STOREFRONT_API_SECRET;
    if (!secret) throw new Error("JAMORA_STOREFRONT_API_SECRET is required.");
    headers.set("x-jamora-storefront-secret", secret);
  }

  const response = await fetch(`${STRAPI_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, body };
}

const safeCustomer = (value: unknown): SafeCustomer | null => {
  return filterCustomer(value) as SafeCustomer | null;
};

export function browserSafeCustomer(value: unknown): SafeCustomer | null {
  return safeCustomer(value);
}

export function browserSafeOperationBody(
  operation: string,
  value: unknown,
): Record<string, unknown> | SafeCustomer | null {
  return filterOperationBody(operation, value);
}

export async function getCurrentCustomer(): Promise<SafeCustomer | null> {
  const cookieStore = await cookies();
  const session = readCustomerSession(
    cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value,
  );
  if (!session) return null;

  try {
    const response = await customerRequest<unknown>(SESSION_PATH, {
      method: "POST",
      body: JSON.stringify({
        documentId: session.sub,
        sessionVersion: session.sessionVersion,
      }),
    });
    if (response.status !== 200) return null;
    const customer = safeCustomer(response.body);
    return customer &&
      customer.active &&
      customer.emailVerifiedAt &&
      customer.documentId === session.sub &&
      customer.email === session.email &&
      customer.sessionVersion === session.sessionVersion
      ? customer
      : null;
  } catch {
    return null;
  }
}

export function customerError(status: number): Response {
  const message =
    status === 401
      ? "Invalid email, password, or session."
      : status === 409
        ? "An account already exists for this email."
        : status >= 400 && status < 500
          ? "Invalid request."
          : "Customer service is unavailable.";
  return Response.json({ error: message }, { status });
}

export function accountsDisabled(): Response | null {
  return customerAccountsEnabled()
    ? null
    : Response.json({ error: "Not found." }, { status: 404 });
}

export async function proxyCustomerBody(
  request: Request,
  operation: string,
): Promise<{ status: number; body: unknown } | Response> {
  const disabled = accountsDisabled();
  if (disabled) return disabled;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    return await customerRequest<unknown>(
      `/api/jamora/customer/${operation}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  } catch {
    return customerError(503);
  }
}
