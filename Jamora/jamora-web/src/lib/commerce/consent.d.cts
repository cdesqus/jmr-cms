export const CONSENT_VERSION: "2026-07-24";

export type ConsentPurpose = "necessary" | "analytics" | "lifecycleEmail";

export type Consent = Readonly<{
  version: typeof CONSENT_VERSION;
  necessary: true;
  analytics: boolean;
  lifecycleEmail: boolean;
  decidedAt: string;
}>;

export function parseConsent(raw: string): Consent | null;
export function allowsPurpose(
  consent: Consent | null | undefined,
  purpose: ConsentPurpose,
): boolean;
