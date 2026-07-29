export function trustedPublicTrackingHeaders(
  inputHeaders: Headers,
  options: {
    env?: Record<string, string | undefined>;
    secret?: string;
    now?: Date;
  },
): Headers;

export function derivePublicTrackingClientKey(
  inputHeaders: Headers,
  env?: Record<string, string | undefined>,
): string;

export function createPublicTrackingBrowserLimiter(options?: {
  limit?: string | number;
  windowMs?: string | number;
  maxBuckets?: string | number;
  now?: () => number;
}): {
  check(
    headers: Headers,
    env?: Record<string, string | undefined>,
  ): { allowed: boolean; retryAfter?: number };
  bucketCount(): number;
};
