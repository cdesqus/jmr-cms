import type { MockOrder } from "./mock-orders";

export function normalizeOrderTimeline(
  value: unknown,
  fallbackCreatedAt?: string,
): NonNullable<MockOrder["statusHistory"]>;
