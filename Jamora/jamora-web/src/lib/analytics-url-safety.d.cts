export type SafeVisitPayload = {
  visitorId: string;
  path: string;
  referrer: string;
  userAgent: string;
};

export function redactSecrets(value: unknown): string;
export function sanitizeAnalyticsLocation(
  value: unknown,
  maximum?: number,
): string;
export function sanitizeVisitPayload(value: unknown): SafeVisitPayload;
