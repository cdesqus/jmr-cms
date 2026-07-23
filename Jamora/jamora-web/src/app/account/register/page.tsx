import { AccountPageFrame, requireCustomerAccounts } from "../account-page";
import { CustomerAuthForm } from "@/components/customer-auth-form";

export default function RegisterPage() {
  requireCustomerAccounts();
  return <AccountPageFrame><CustomerAuthForm mode="register" /></AccountPageFrame>;
}
