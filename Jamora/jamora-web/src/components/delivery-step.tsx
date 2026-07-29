"use client";

import type { ShippingQuote } from "@/lib/checkout-wizard-policy.cjs";

function formatRON(amountMinor: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "RON",
  }).format(amountMinor / 100);
}

export function DeliveryStep({
  authoritative,
  quotes,
  selected,
  loading,
  error,
  disabled = false,
  fallbackShippingLabel,
  onSelect,
  onRetry,
}: {
  authoritative: boolean;
  quotes: ShippingQuote[];
  selected?: ShippingQuote;
  loading: boolean;
  error: string;
  disabled?: boolean;
  fallbackShippingLabel: string;
  onSelect(quote: ShippingQuote): void;
  onRetry(): void;
}) {
  if (!authoritative) {
    return (
      <div className="rounded-xl border border-clay bg-cream p-4">
        <p className="font-semibold text-ink">Manual delivery fallback</p>
        <p className="mt-1 text-sm text-bark">
          {fallbackShippingLabel}. The existing checkout delivery rule remains active.
        </p>
      </div>
    );
  }
  return (
    <fieldset disabled={loading || disabled}>
      <legend className="font-semibold text-ink">Choose a server quote</legend>
      <p className="mt-1 text-sm text-stone">
        Prices and estimates below come from the server and are revalidated when the order is prepared.
      </p>
      {loading ? (
        <p className="mt-4 rounded-lg bg-sand/50 p-3 text-sm text-bark" aria-live="polite">
          Loading delivery quotes…
        </p>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-terracotta/50 bg-red-50 p-3 text-sm text-terracotta-deep" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">
            Try again
          </button>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3">
        {quotes.map((quote) => (
          <label
            key={quote.quoteId}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-clay bg-cream p-4"
          >
            <input
              type="radio"
              name="delivery-quote"
              checked={selected?.quoteId === quote.quoteId}
              onChange={() => onSelect(quote)}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap justify-between gap-2 font-semibold text-ink">
                <span>{quote.carrier} · {quote.service}</span>
                <span>{formatRON(quote.amountMinor)}</span>
              </span>
              <span className="mt-1 block text-xs text-stone">
                Estimated {quote.estimate.minimumDays}–{quote.estimate.maximumDays} business days
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
