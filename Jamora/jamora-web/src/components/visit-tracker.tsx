"use client";

import { useEffect } from "react";

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
    const path = `${window.location.pathname}${window.location.search}`;

    fetch("/api/jamora/analytics/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        visitorId: getVisitorId(),
        path,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}
