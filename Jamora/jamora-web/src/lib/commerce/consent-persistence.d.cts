import type { Consent } from "./consent.cjs";

export type ConsentDecision = {
  decisionId: string;
  anonymousSessionId: string;
  necessary: boolean;
  analytics: boolean;
  lifecycleEmail: boolean;
};

export function buildConsentDecision(
  consent: Consent,
  anonymousSessionId: string,
  decisionId: string,
): ConsentDecision;
export function pendingConsentQueue(
  queue: ConsentDecision[],
  decision: ConsentDecision,
): ConsentDecision[];
export function parsePendingConsentQueue(raw: string | null | undefined): ConsentDecision[];
export function dispatchConsentPersistenceFailure(dispatch: (eventName: string) => void): void;
