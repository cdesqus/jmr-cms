import { AccountPageFrame, requireCustomerAccounts } from "../account-page";
import { CustomerAuthForm } from "@/components/customer-auth-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  requireCustomerAccounts();
  const value = (await searchParams).token;
  const token = typeof value === "string" ? value : "";
  return (
    <AccountPageFrame>
      {token ? (
        <CustomerAuthForm mode="reset-password" token={token} />
      ) : (
        <section className="mx-auto max-w-md rounded-xl border border-clay bg-white/70 p-8">
          <h1 className="font-display text-3xl font-semibold">Invalid reset link</h1>
          <p className="mt-3 text-bark">This password reset link is missing its token.</p>
        </section>
      )}
    </AccountPageFrame>
  );
}
