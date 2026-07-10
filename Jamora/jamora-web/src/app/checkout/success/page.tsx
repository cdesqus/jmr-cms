import type { Metadata } from "next";
import { OrderDetail } from "@/components/order-detail";

export const metadata: Metadata = {
  title: "Order Confirmed",
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <OrderDetail orderId={order ?? null} mode="success" />
    </div>
  );
}

