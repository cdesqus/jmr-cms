"use client";

import { useEffect, useId, useRef, useState } from "react";
import { StructuredAddressForm } from "@/components/structured-address-form";
import {
  applyRomanianAddressSuggestion,
  type StructuredAddress,
} from "@/lib/commerce/address.cjs";
import {
  addressWarningMessage,
} from "@/lib/checkout-wizard-policy.cjs";
import {
  suggestRomanianAddresses,
  type AddressSuggestion,
} from "@/lib/shipping-api";

export function AddressWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
      <p className="font-semibold">Please review this address</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{addressWarningMessage(warning)}</li>
        ))}
      </ul>
    </div>
  );
}

export function AddressAssistStep({
  value,
  onChange,
  errors,
  warnings,
  enabled,
  disabled = false,
  reservationCapability,
}: {
  value: StructuredAddress;
  onChange(value: StructuredAddress): void;
  errors: string[];
  warnings: string[];
  enabled: boolean;
  disabled?: boolean;
  reservationCapability?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [assistError, setAssistError] = useState("");
  const [loading, setLoading] = useState(false);
  const committedQuery = useRef("");

  useEffect(() => {
    if (
      !enabled ||
      disabled ||
      query === committedQuery.current ||
      query.trim().length < 3
    ) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void suggestRomanianAddresses(query, reservationCapability)
        .then((next) => {
          if (!active) return;
          setSuggestions(next);
          setActiveIndex(next.length ? 0 : -1);
          setAssistError("");
        })
        .catch(() => {
          if (!active) return;
          setSuggestions([]);
          setActiveIndex(-1);
          setAssistError("Address suggestions are unavailable. Continue by entering the address manually.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [disabled, enabled, query, reservationCapability]);

  function choose(suggestion: AddressSuggestion) {
    onChange(applyRomanianAddressSuggestion(value, suggestion));
    const label = `${suggestion.street} ${suggestion.building}, ${suggestion.locality}`;
    committedQuery.current = label;
    setQuery(label);
    setSuggestions([]);
    setActiveIndex(-1);
  }

  return (
    <div className="space-y-4">
      {enabled ? (
        <div className="relative">
          <label htmlFor={`${listId}-input`} className="block text-xs font-semibold uppercase text-stone">
            Find an address
          </label>
          <input
            id={`${listId}-input`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
            }
            value={query}
            disabled={disabled}
            onChange={(event) => {
              committedQuery.current = "";
              setQuery(event.target.value);
              setAssistError("");
              if (event.target.value.trim().length < 3) {
                setSuggestions([]);
                setActiveIndex(-1);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestions.length) {
                event.preventDefault();
                setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1));
              } else if (event.key === "ArrowUp" && suggestions.length) {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                choose(suggestions[activeIndex]);
              } else if (event.key === "Escape") {
                setSuggestions([]);
                setActiveIndex(-1);
              }
            }}
            autoComplete="off"
            placeholder="Street, number, locality or postal code"
            className="mt-1 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-terracotta"
          />
          {!disabled && suggestions.length ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-clay bg-cream p-1 shadow-lg"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  id={`${listId}-option-${index}`}
                  key={`${suggestion.postalCode}:${suggestion.street}:${suggestion.building}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  aria-disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!disabled) choose(suggestion);
                  }}
                  className={`cursor-pointer rounded-md px-3 py-2 text-left text-sm ${
                    index === activeIndex ? "bg-sand text-ink" : "text-bark hover:bg-sand/60"
                  }`}
                >
                  <span className="block font-semibold">
                    {suggestion.street} {suggestion.building}
                  </span>
                  <span className="block text-xs text-stone">
                    {suggestion.postalCode} {suggestion.locality}, {suggestion.subdivisionCode}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-xs text-stone" aria-live="polite">
            {loading
              ? "Finding suggestions…"
              : "Suggestions are advisory. Review and edit every field below."}
          </p>
          {assistError ? (
            <p className="mt-1 text-xs text-terracotta-deep" role="status">
              {assistError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg bg-sand/50 p-3 text-sm text-bark">
          Address assistance is off. Enter the structured Romanian address manually.
        </p>
      )}

      <AddressWarnings warnings={warnings} />

      <StructuredAddressForm
        value={value}
        onChange={onChange}
        errors={errors}
        disabled={disabled}
      />
    </div>
  );
}
