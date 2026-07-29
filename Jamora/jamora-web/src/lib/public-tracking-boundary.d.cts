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
