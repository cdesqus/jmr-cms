import { PaymentInstructions } from "@/components/payment-instructions";

export default async function PaymentStatusPage({
  params,
}: PageProps<"/payment/status/[reference]">) {
  const { reference } = await params;
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <PaymentInstructions reference={reference} />
    </main>
  );
}
