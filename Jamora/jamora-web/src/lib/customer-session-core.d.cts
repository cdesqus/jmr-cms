export const CUSTOMER_SESSION_MAX_AGE_SECONDS: number;

export function createSignedCustomerSession(
  customer: { sub: string; email: string; sessionVersion: number },
  secret: string,
  now?: number,
): string;

export function readSignedCustomerSession(
  value: string | undefined,
  secret: string,
  now?: number,
): {
  sub: string;
  email: string;
  sessionVersion: number;
  issuedAt: number;
  expiresAt: number;
} | null;

export function resolveCustomerSessionSecret(
  configuredSecret: string | undefined,
  nodeEnv: string | undefined,
): string;
