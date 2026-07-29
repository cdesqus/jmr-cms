export const AFFILIATE_STORAGE_KEY = "jamora_affiliate";

export function currentAffiliateCode() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(AFFILIATE_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { code?: string; expiresAt?: number };
    if (!parsed.code || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      return "";
    }
    return parsed.code;
  } catch {
    return "";
  }
}
