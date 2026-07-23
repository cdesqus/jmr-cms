import { AccountPageFrame, requireCustomerAccounts } from "../account-page";
import { CustomerAuthForm } from "@/components/customer-auth-form";

export default function LoginPage() {
  requireCustomerAccounts();
  return <AccountPageFrame><CustomerAuthForm mode="login" /></AccountPageFrame>;
}
