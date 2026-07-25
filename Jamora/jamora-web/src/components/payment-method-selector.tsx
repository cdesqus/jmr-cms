"use client";

import { useEffect, useState } from "react";
import type { PaymentMethod } from "@/lib/payment-customer-policy.cjs";
import { acceptedPaymentMethods } from "@/lib/payment-customer-view.cjs";

export function PaymentMethodSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
}) {
  const [methods, setMethods] = useState<PaymentMethod[]>(["bank_transfer"]);

  useEffect(() => {
    let active = true;
    void fetch("/api/jamora/payments/methods", { cache: "no-store" })
      .then(async (response) => (
        response.ok
          ? acceptedPaymentMethods(await response.json())
          : (["bank_transfer"] as PaymentMethod[])
      ))
      .catch(() => ["bank_transfer"] as PaymentMethod[])
      .then((available) => {
        if (!active) return;
        setMethods(available);
        if (!available.includes(value)) onChange("bank_transfer");
      });
    return () => {
      active = false;
    };
  }, [onChange, value]);

  return (
    <fieldset className="mt-5 border-t border-clay/60 pt-5" disabled={disabled}>
      <legend className="text-xs font-semibold uppercase text-stone">
        Payment method
      </legend>
      <div className="mt-3 grid gap-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-clay bg-cream p-3">
          <input
            type="radio"
            name="payment-method"
            value="bank_transfer"
            checked={value === "bank_transfer"}
            onChange={() => onChange("bank_transfer")}
            className="mt-1"
          />
          <span>
            <span className="block font-semibold text-ink">Manual bank transfer</span>
            <span className="block text-xs text-stone">
              Always available. Use the exact reference shown after checkout.
            </span>
          </span>
        </label>
        {methods.includes("ropay") ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-clay bg-cream p-3">
            <input
              type="radio"
              name="payment-method"
              value="ropay"
              checked={value === "ropay"}
              onChange={() => onChange("ropay")}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold text-ink">RoPay</span>
              <span className="block text-xs text-stone">
                Scan the verified provider QR or open the RoPay app.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}
