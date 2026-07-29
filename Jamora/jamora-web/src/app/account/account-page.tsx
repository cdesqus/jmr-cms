import { notFound } from "next/navigation";
import { customerAccountsEnabled } from "@/lib/customer-api";

export function requireCustomerAccounts(): void {
  if (!customerAccountsEnabled()) notFound();
}

export function AccountPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-16 sm:py-24">
      {children}
    </div>
  );
}
