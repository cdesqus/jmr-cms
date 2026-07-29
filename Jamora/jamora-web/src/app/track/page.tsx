import type { Metadata } from "next";
import { TrackingView } from "@/components/tracking-view";

export const metadata: Metadata = {
  title: "Track Order",
};

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; access?: string }>;
}) {
  const { order, access } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">
        Order tracking
      </p>
      <h1 className="mt-3 font-display text-4xl text-ink">Track your Jamora order</h1>
      <p className="mt-3 max-w-2xl text-stone">
        Open or paste the secure tracking link from your confirmation. Order
        and tracking numbers alone cannot reveal shipment details.
      </p>
      <TrackingView initialQuery={order ?? ""} initialAccess={access} />
    </div>
  );
}
