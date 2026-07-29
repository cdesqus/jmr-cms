"use client";

import { useEffect } from "react";
import { AFFILIATE_STORAGE_KEY } from "@/lib/affiliate-attribution";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function AffiliateTracker({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref")?.trim().replace(/\s+/g, "").toUpperCase();
    if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code)) return;
    window.localStorage.setItem(AFFILIATE_STORAGE_KEY, JSON.stringify({
      code,
      expiresAt: Date.now() + THIRTY_DAYS_MS,
    }));
    document.cookie = `${AFFILIATE_STORAGE_KEY}=${encodeURIComponent(code)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; SameSite=Lax`;
    void fetch("/api/jamora/affiliates/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, source: "link", landingPage: window.location.pathname }),
    }).catch(() => undefined);
  }, [enabled]);
  return null;
}
