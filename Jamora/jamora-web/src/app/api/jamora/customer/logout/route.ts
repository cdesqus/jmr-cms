import { accountsDisabled } from "@/lib/customer-api";
import { clearCustomerSessionCookie } from "@/lib/customer-session";

export async function POST() {
  const disabled = accountsDisabled();
  if (disabled) return disabled;
  await clearCustomerSessionCookie();
  return Response.json({ success: true });
}
