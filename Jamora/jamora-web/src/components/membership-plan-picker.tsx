"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerMembershipPlan } from "@/lib/membership-customer-api";

const money = (minor: number, currency: "EUR" | "RON") =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);

export function MembershipPlanPicker({ plans }: { plans: CustomerMembershipPlan[] }) {
  const router = useRouter();
  const requestKeys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function purchase(planDocumentId: string) {
    setBusy(planDocumentId);
    setError("");
    const idempotencyKey = requestKeys.current.get(planDocumentId) ?? `purchase:${crypto.randomUUID()}`;
    requestKeys.current.set(planDocumentId, idempotencyKey);
    try {
      const response = await fetch("/api/jamora/membership/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planDocumentId, idempotencyKey }),
      });
      if (!response.ok) throw new Error("Your membership could not be activated. Please retry.");
      requestKeys.current.delete(planDocumentId);
      router.push("/account/membership");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your membership could not be activated. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <p role="alert" className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.documentId} className="flex flex-col rounded-2xl border border-clay bg-white/80 p-6">
            <p className="eyebrow text-terracotta">{plan.durationMonths} months</p>
            <h2 className="mt-2 font-display text-2xl font-semibold">{plan.name}</h2>
            <p className="mt-5 text-2xl font-semibold text-bark">{money(plan.priceRonMinor, "RON")}</p>
            <p className="text-sm text-stone">Reference {money(plan.priceEurMinor, "EUR")}</p>
            <p className="mt-5 font-semibold">{plan.packageCredits} package credits included</p>
            <p className="mt-3 text-sm text-stone">
              Eligible packages: {plan.eligibleProductSlugs.join(", ").replaceAll("-", " ")}
            </p>
            <p className="mt-4 text-sm font-semibold text-terracotta">
              Shipping is paid at each redemption checkout.
            </p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void purchase(plan.documentId)}
              className="mt-7 rounded-full bg-bark px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === plan.documentId ? "Activating…" : "Buy membership"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
