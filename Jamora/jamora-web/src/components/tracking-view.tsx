"use client";

import { useState } from "react";
import { OrderDetail } from "@/components/order-detail";

export function TrackingView({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState<string | null>(
    initialQuery.trim() || null,
  );

  return (
    <div className="mt-8 space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
        className="flex flex-col gap-3 rounded-xl border border-clay/70 bg-sand/30 p-5 sm:flex-row"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="JMR-2026-123456 or JM123456EU"
          className="min-h-11 flex-1 rounded-lg border border-clay bg-cream px-3 text-sm text-ink outline-none focus:border-terracotta"
        />
        <button
          type="submit"
          className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          Track
        </button>
      </form>

      {submitted && <OrderDetail orderId={submitted} mode="tracking" />}
    </div>
  );
}
