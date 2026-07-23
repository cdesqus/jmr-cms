import {
  accountsDisabled,
  getCurrentCustomer,
} from "@/lib/customer-api";
import { clearCustomerSessionCookie } from "@/lib/customer-session";

export async function GET() {
  const disabled = accountsDisabled();
  if (disabled) return disabled;
  const customer = await getCurrentCustomer();
  if (!customer) {
    await clearCustomerSessionCookie();
    return Response.json({ error: "Invalid session." }, { status: 401 });
  }
  return Response.json(customer);
}
