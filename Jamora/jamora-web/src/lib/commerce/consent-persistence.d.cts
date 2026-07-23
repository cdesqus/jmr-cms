import type { Consent } from "./consent.cjs";

export type ConsentDecision = {
  anonymousSessionId: string;
  purposes: {
    necessary: boolean;
    analytics: boolean;
    lifecycleEmail: boolean;
  };
  policyVersion: string;
  source: string;
  decidedAt: string;
};

export function buildConsentDecision(
  consent: Consent,
  anonymousSessionId: string,
  source: string,
): ConsentDecision;
export function pendingConsentQueue(
  queue: ConsentDecision[],
  decision: ConsentDecision,
): ConsentDecision[];
