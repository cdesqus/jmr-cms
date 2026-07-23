import { AccountPageFrame, requireCustomerAccounts } from "../account-page";
import { CustomerAuthForm } from "@/components/customer-auth-form";

export default function ForgotPasswordPage() {
  requireCustomerAccounts();
  return <AccountPageFrame><CustomerAuthForm mode="forgot-password" /></AccountPageFrame>;
}
