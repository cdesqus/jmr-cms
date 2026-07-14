import type { Metadata } from "next";
import { TrackingView } from "@/components/tracking-view";

export const metadata: Metadata = {
  title: "Track Order",
};

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">
        Order tracking
      </p>
      <h1 className="mt-3 font-display text-4xl text-ink">Track your Jamora order</h1>
      <p className="mt-3 max-w-2xl text-stone">
        Enter the order number or tracking number from your confirmation page.
        We will look it up from the Jamora fulfilment dashboard.
      </p>
      <TrackingView initialQuery={order ?? ""} />
    </div>
  );
}
