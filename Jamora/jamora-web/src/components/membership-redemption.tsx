"use client";

import { formatEUR } from "@/lib/products";

export type RedemptionMembership = {
  documentId: string;
  membershipNumber: string;
  ledgerBalance: number;
  planSnapshot: {
    name: string;
    eligibleProductSlugs: string[];
  };
};

export function MembershipRedemption({
  membership,
  selected,
  coveredMinor,
  creditsRequired,
  shippingMinor,
  shippingLabel,
  eligibleItems,
  onChange,
}: {
  membership: RedemptionMembership;
  selected: boolean;
  coveredMinor: number;
  creditsRequired: number;
  shippingMinor: number;
  shippingLabel?: string;
  eligibleItems: { name: string; qty: number; creditCost: number }[];
  onChange: (selected: boolean) => void;
}) {
  return (
    <section className="mt-4 rounded-lg border border-herb/40 bg-cream p-4">
      <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-herb-deep"
        />
        Use membership credits
      </label>
      {selected ? (
        <>
        <ul className="mt-3 space-y-1 text-xs text-bark">
          {eligibleItems.map((item) => (
            <li key={item.name} className="flex justify-between">
              <span>{item.name} × {item.qty}</span>
              <span>{item.qty * item.creditCost} credit{item.qty * item.creditCost === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-herb/20 pt-2 text-xs text-bark">
          <div className="flex justify-between"><dt>Plan</dt><dd>{membership.planSnapshot.name}</dd></div>
          <div className="flex justify-between"><dt>Credits required</dt><dd>{creditsRequired}</dd></div>
          <div className="flex justify-between"><dt>Remaining after checkout</dt><dd>{membership.ledgerBalance - creditsRequired}</dd></div>
          <div className="flex justify-between"><dt>Covered merchandise</dt><dd>{formatEUR(coveredMinor)}</dd></div>
          <div className="flex justify-between gap-3 font-semibold">
            <dt>Shipping due</dt>
            <dd className="text-right">{shippingLabel ?? formatEUR(shippingMinor)}</dd>
          </div>
        </dl>
        </>
      ) : null}
    </section>
  );
}
