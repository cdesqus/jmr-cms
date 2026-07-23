import "server-only";
import { cookies } from "next/headers";
import {
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  createSignedCustomerSession,
  readSignedCustomerSession,
  resolveCustomerSessionSecret,
} from "./customer-session-core.cjs";

export const CUSTOMER_SESSION_COOKIE = "jamora_customer_session";

export type CustomerSession = {
  sub: string;
  email: string;
  sessionVersion: number;
  issuedAt: number;
  expiresAt: number;
};

const sessionSecret = () =>
  resolveCustomerSessionSecret(
    process.env.CUSTOMER_SESSION_TOKEN,
    process.env.NODE_ENV,
  );

export function createCustomerSession(customer: {
  sub: string;
  email: string;
  sessionVersion: number;
}): string {
  return createSignedCustomerSession(customer, sessionSecret());
}

export function readCustomerSession(
  value: string | undefined,
): CustomerSession | null {
  return readSignedCustomerSession(value, sessionSecret());
}

export async function setCustomerSessionCookie(value: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearCustomerSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
