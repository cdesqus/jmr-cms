import { connection } from "next/server";
import { requireCustomerAccounts } from "./account-page";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  requireCustomerAccounts();
  return children;
}
