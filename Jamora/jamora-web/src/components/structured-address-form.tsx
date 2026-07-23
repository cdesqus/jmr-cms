"use client";

import type { StructuredAddress } from "@/lib/commerce/address.cjs";

export type StructuredAddressFormProps = {
  value: StructuredAddress;
  onChange(value: StructuredAddress): void;
  errors: string[];
};

const fields: {
  key: keyof StructuredAddress;
  label: string;
  autoComplete: string;
  required?: boolean;
}[] = [
  { key: "recipient", label: "Recipient", autoComplete: "shipping name", required: true },
  { key: "phone", label: "Phone", autoComplete: "shipping tel" },
  { key: "subdivisionCode", label: "County", autoComplete: "shipping address-level1" },
  { key: "locality", label: "Locality", autoComplete: "shipping address-level2", required: true },
  { key: "postalCode", label: "Postal code", autoComplete: "shipping postal-code", required: true },
  { key: "street", label: "Street", autoComplete: "shipping address-line1", required: true },
  { key: "building", label: "Building / number", autoComplete: "shipping address-line2", required: true },
  { key: "unit", label: "Apartment / unit", autoComplete: "shipping address-line3" },
];

export function StructuredAddressForm({
  value,
  onChange,
  errors,
}: StructuredAddressFormProps) {
  const update = (key: keyof StructuredAddress, nextValue: string) =>
    onChange({ ...value, [key]: nextValue });

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase text-stone">Shipping address</legend>
      <label className="block text-xs font-semibold uppercase text-stone">
        Country
        <input
          value="Romania"
          readOnly
          autoComplete="shipping country-name"
          className="mt-1 w-full rounded-lg border border-clay bg-sand/50 px-3 py-2 text-sm normal-case text-ink"
        />
      </label>
      {fields.map((field) => (
        <label key={field.key} className="block text-xs font-semibold uppercase text-stone">
          {field.label}
          <input
            value={value[field.key]}
            onChange={(event) => update(field.key, event.target.value)}
            autoComplete={field.autoComplete}
            aria-invalid={errors.includes(field.key)}
            required={field.required}
            className="mt-1 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm normal-case text-ink outline-none focus:border-terracotta aria-invalid:border-terracotta-deep"
          />
        </label>
      ))}
      <label className="block text-xs font-semibold uppercase text-stone">
        Delivery instructions
        <textarea
          value={value.instructions}
          onChange={(event) => update("instructions", event.target.value)}
          autoComplete="off"
          className="mt-1 min-h-20 w-full rounded-lg border border-clay bg-cream px-3 py-2 text-sm normal-case text-ink outline-none focus:border-terracotta"
        />
      </label>
    </fieldset>
  );
}
