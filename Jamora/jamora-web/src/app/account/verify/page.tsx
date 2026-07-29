import { VerifyCustomerEmail } from "@/components/customer-auth-form";
import { AccountPageFrame, requireCustomerAccounts } from "../account-page";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  requireCustomerAccounts();
  const value = (await searchParams).token;
  const token = typeof value === "string" ? value : "";
  return (
    <AccountPageFrame>
      <VerifyCustomerEmail token={token} />
    </AccountPageFrame>
  );
}
