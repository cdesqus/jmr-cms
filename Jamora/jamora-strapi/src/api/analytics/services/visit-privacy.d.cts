export type SafeVisitPayload = {
  visitorId: string;
  path: string;
  referrer: string;
  userAgent: string;
};

export function sanitizeVisitPayload(value: unknown): SafeVisitPayload;
export function createVisitPrivacyPurge(adapter: unknown): {
  run(input?: {
    cursor?: string;
    limit?: number;
    actor?: string;
  }): Promise<{
    scanned: number;
    updated: number;
    nextCursor: string | null;
    complete: boolean;
  }>;
};
export function createStrapiVisitPrivacyAdapter(strapi: unknown): unknown;
export function createMemoryVisitPrivacyAdapter(options?: unknown): any;
