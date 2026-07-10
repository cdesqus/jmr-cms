import type { Metadata } from "next";
import { DeliveryLabel } from "@/components/delivery-label";

export const metadata: Metadata = {
  title: "Delivery Label",
};

export default async function DeliveryLabelPage({
  params,
}: {
  params: Promise<{ order: string }>;
}) {
  const { order } = await params;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <DeliveryLabel orderNumber={decodeURIComponent(order)} />
    </div>
  );
}

