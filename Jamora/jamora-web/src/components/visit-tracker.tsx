"use client";

import { useEffect } from "react";
import { sanitizeVisitPayload } from "@/lib/analytics-url-safety.cjs";

const VISITOR_KEY = "jamora.visitor-id.v1";

function getVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return "anonymous";
  }
}

export function VisitTracker() {
  useEffect(() => {
    const payload = sanitizeVisitPayload({
      visitorId: getVisitorId(),
      path: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
    });

    fetch("/api/jamora/analytics/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}
