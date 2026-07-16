import "server-only";
import { cookies } from "next/headers";
import { identityForSession } from "@/lib/admin-auth";

export async function getAdminIdentity() {
  const cookieStore = await cookies();
  return identityForSession(cookieStore.get("jamora_admin_session")?.value);
}

export async function adminIdentityHeaders(): Promise<Record<string, string>> {
  const identity = await getAdminIdentity();
  return identity
    ? {
        "x-jamora-admin-actor": identity.email,
        "x-jamora-admin-role": String(identity.role),
      }
    : {};
}
