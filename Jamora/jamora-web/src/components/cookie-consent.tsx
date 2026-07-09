"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "jamora.consent.v1";

type Consent = {
  necessary: true; // always on
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

const CATEGORIES: {
  key: "necessary" | "analytics" | "marketing";
  label: string;
  description: string;
  locked?: boolean;
}[] = [
  {
    key: "necessary",
    label: "Strictly necessary",
    description:
      "Required for the site to function — cart, security, and load balancing. Always active.",
    locked: true,
  },
  {
    key: "analytics",
    label: "Privacy-friendly analytics",
    description:
      "Aggregate, cookieless visit statistics (Plausible/Matomo) to help us improve. No personal profiling.",
  },
  {
    key: "marketing",
    label: "Marketing",
    description:
      "Lets us measure campaigns and show relevant offers. Off unless you opt in.",
  },
];

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Consent state lives in localStorage, unavailable during SSR — we default
    // to hidden and reveal after mount if no prior choice exists.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) setVisible(true);
    } catch {
      setVisible(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function persist(consent: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch {
      // ignore
    }
    setVisible(false);
  }

  const now = () => Date.parse(new Date().toISOString());

  function acceptAll() {
    persist({ necessary: true, analytics: true, marketing: true, ts: now() });
  }
  function rejectAll() {
    persist({ necessary: true, analytics: false, marketing: false, ts: now() });
  }
  function saveChoices() {
    persist({ necessary: true, analytics, marketing, ts: now() });
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="mx-auto max-w-3xl rounded-xl border border-clay bg-cream p-5 shadow-2xl sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg text-ink">We respect your privacy</h2>
          <p className="text-sm text-bark">
            We use cookies to run the store and, only with your consent, to
            understand how the site is used. You choose — this is not a single
            &ldquo;OK&rdquo; button.
          </p>
        </div>

        {customising && (
          <ul className="mt-4 space-y-3 border-t border-clay/60 pt-4">
            {CATEGORIES.map((cat) => {
              const checked =
                cat.key === "necessary"
                  ? true
                  : cat.key === "analytics"
                    ? analytics
                    : marketing;
              return (
                <li key={cat.key} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={`consent-${cat.key}`}
                    checked={checked}
                    disabled={cat.locked}
                    onChange={(e) => {
                      if (cat.key === "analytics") setAnalytics(e.target.checked);
                      if (cat.key === "marketing") setMarketing(e.target.checked);
                    }}
                    className="mt-1 h-4 w-4 accent-[var(--color-terracotta)] disabled:opacity-60"
                  />
                  <label htmlFor={`consent-${cat.key}`} className="flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      {cat.label}
                      {cat.locked && (
                        <span className="ml-2 text-xs font-normal text-stone">
                          (always on)
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-stone">
                      {cat.description}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={rejectAll}
            className="rounded-full border border-clay bg-white/60 px-5 py-2.5 text-sm font-semibold text-bark hover:border-terracotta hover:text-terracotta"
          >
            Reject non-essential
          </button>
          {customising ? (
            <button
              type="button"
              onClick={saveChoices}
              className="rounded-full border border-clay bg-white/60 px-5 py-2.5 text-sm font-semibold text-bark hover:border-terracotta hover:text-terracotta"
            >
              Save my choices
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCustomising(true)}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-bark underline underline-offset-4 hover:text-terracotta"
            >
              Customise
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
